import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { assertCompleteCozSnapshot, mergeCozSnapshot, normalizeCozResponse } from "./coz-sync-core.js";

const source = "coz-direct-api";
const advisoryLockId = 194662026;
const apiUrl = process.env.COZ_INVENTORY_API_URL || "http://it.justinallen.com:8899/coz/Home/GetTableDataWithOffset";
const requestPath = process.env.COZ_INVENTORY_REQUEST_PATH
  || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../deploy/ubuntu/coz-inventory-request.json");
const timeoutMs = Number(process.env.COZ_SYNC_TIMEOUT_MS || 50000);
const pool = new Pool();

async function fetchCozSnapshot() {
  const requestBody = await readFile(requestPath, "utf8");
  JSON.parse(requestBody);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Accept: "application/json" },
      body: requestBody,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`CoZ API returned HTTP ${response.status}`);
    const payload = await response.json();
    const snapshot = normalizeCozResponse(payload, "CoZ");
    assertCompleteCozSnapshot(snapshot);
    return snapshot;
  } finally {
    clearTimeout(timeout);
  }
}

async function synchronize() {
  const client = await pool.connect();
  let runId = null;
  let locked = false;
  try {
    const lockResult = await client.query("select pg_try_advisory_lock($1) as locked", [advisoryLockId]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) {
      console.log("CoZ synchronization is already running; skipping this timer tick");
      return;
    }
    const run = await client.query(
      "insert into inventory_sync_runs (source, status, details) values ($1, 'running', $2::jsonb) returning id",
      [source, JSON.stringify({ apiUrl })]
    );
    runId = run.rows[0].id;
    const snapshot = await fetchCozSnapshot();
    const syncedAt = new Date().toISOString();

    await client.query("begin");
    const current = await client.query("select data from inventory_platform_state where id = 'default' for update");
    if (!current.rows[0]?.data) throw new Error("Inventory platform state has not been initialized");
    const merged = mergeCozSnapshot(current.rows[0].data, snapshot, syncedAt);
    await client.query(
      "insert into inventory_platform_state_history (state_id, data, source) values ('default', $1::jsonb, $2)",
      [JSON.stringify(current.rows[0].data), source]
    );
    await client.query(
      "update inventory_platform_state set data = $1::jsonb, updated_at = now() where id = 'default'",
      [JSON.stringify(merged)]
    );
    await client.query(
      "delete from inventory_platform_state_history where revision_id not in (select revision_id from inventory_platform_state_history order by created_at desc limit 200)"
    );
    await client.query("commit");
    await client.query(
      "update inventory_sync_runs set status = 'succeeded', sku_count = $1, details = $2::jsonb, finished_at = now() where id = $3",
      [snapshot.skuCount, JSON.stringify({
        sourceRowCount: snapshot.sourceRowCount,
        brandRowCount: snapshot.brandRowCount,
        duplicateRowCount: snapshot.duplicateRowCount,
        stockedQuantity: snapshot.stockedQuantity,
        reservedQuantity: snapshot.reservedQuantity,
        syncedAt
      }), runId]
    );
    console.log(`CoZ direct synchronization succeeded: ${snapshot.skuCount} SKUs, ${snapshot.stockedQuantity} units`);
  } catch (error) {
    try { await client.query("rollback"); } catch (_) { /* No active transaction. */ }
    if (runId) {
      await client.query(
        "update inventory_sync_runs set status = 'failed', details = $1::jsonb, finished_at = now() where id = $2",
        [JSON.stringify({ apiUrl, error: String(error?.message || error).slice(0, 1000) }), runId]
      );
    }
    throw error;
  } finally {
    if (locked) await client.query("select pg_advisory_unlock($1)", [advisoryLockId]);
    client.release();
  }
}

try {
  await synchronize();
} catch (error) {
  console.error("CoZ direct synchronization failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
