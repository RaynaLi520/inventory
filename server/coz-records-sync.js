import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { normalizeCozRecordPayload, patchPageRequest, responseHasMore } from "./coz-records-core.js";

const baseUrl = String(process.env.COZ_RECORDS_BASE_URL || "http://it.justinallen.com:8899/coz/Home/GetTableDataWithOffset");
const requestRoot = String(process.env.COZ_RECORDS_REQUEST_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../deploy/ubuntu"));
const configs = [
  { kind: "purchase", url: process.env.COZ_PURCHASE_RECORDS_API_URL || baseUrl, file: process.env.COZ_PURCHASE_RECORDS_REQUEST_PATH || path.join(requestRoot, "coz-purchase-records-request.json") },
  { kind: "inbound", url: process.env.COZ_INBOUND_RECORDS_API_URL || baseUrl, file: process.env.COZ_INBOUND_RECORDS_REQUEST_PATH || path.join(requestRoot, "coz-inbound-records-request.json") }
];
const timeoutMs = Number(process.env.COZ_RECORDS_SYNC_TIMEOUT_MS || 50000);
const pageSize = Number(process.env.COZ_RECORDS_PAGE_SIZE || 500);
const maxPages = Number(process.env.COZ_RECORDS_MAX_PAGES || 200);
const cookie = String(process.env.COZ_RECORDS_COOKIE || "").trim();
let fieldMaps = {};
try { fieldMaps = JSON.parse(String(process.env.COZ_RECORDS_FIELD_MAPS || "{}")); }
catch (error) { throw new Error(`COZ_RECORDS_FIELD_MAPS is not valid JSON: ${error.message}`); }
const pool = new Pool();

async function fetchRecords(config) {
  const request = JSON.parse(await readFile(config.file, "utf8"));
  const allRows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(config.url, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: JSON.stringify(patchPageRequest(request, page)),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`${config.kind} API returned HTTP ${response.status}`);
      const payload = await response.json();
      const rows = payload?.table?.Data || payload?.Data || payload?.data?.Data || [];
      if (!Array.isArray(rows)) throw new Error(`${config.kind} API response does not contain rows`);
      allRows.push(...rows);
      if (!responseHasMore(payload, allRows.length, pageSize) || rows.length === 0) break;
    } finally {
      clearTimeout(timeout);
    }
  }
  return normalizeCozRecordPayload({ Data: allRows, AllRowLoaded: true }, config.kind, fieldMaps[config.kind] || {});
}

async function synchronize() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const summary = {};
    for (const config of configs) {
      const records = await fetchRecords(config);
      await client.query("delete from coz_external_records where kind = $1", [config.kind]);
      for (const record of records) {
        await client.query(
          `insert into coz_external_records (kind, source_key, sku, purchase_order, quantity, recorded_at, data, synced_at)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())`,
          [record.kind, record.sourceKey, record.sku, record.purchaseOrder, record.quantity, record.recordedAt, JSON.stringify(record.raw)]
        );
      }
      summary[config.kind] = records.length;
    }
    await client.query("commit");
    console.log(`CoZ external records synchronization succeeded: ${JSON.stringify(summary)}`);
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

try {
  await synchronize();
} catch (error) {
  console.error("CoZ external records synchronization failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
