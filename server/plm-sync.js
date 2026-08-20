import { Pool } from "pg";
import { fetchPlmSnapshot } from "./plm-client.js";
import { mergePlmSnapshot } from "./plm-sync-core.js";

const source = "centric-plm";
const advisoryLockId = 194662027;
const baseUrl = String(process.env.PLM_BASE_URL || "http://172.16.100.225").replace(/\/$/, "");
const username = String(process.env.PLM_USERNAME || "").trim();
const password = String(process.env.PLM_PASSWORD || "");
const styleUrls = String(process.env.PLM_STYLE_URLS || "").split(",").map((value) => value.trim()).filter(Boolean);
const rootUrl = String(process.env.PLM_ROOT_URL || "C243138").trim();
const scopeName = String(process.env.PLM_SCOPE_NAME || "CoZ").trim();
const pool = new Pool();

async function synchronize() {
  const client = await pool.connect();
  let runId = null;
  let locked = false;
  try {
    const lockResult = await client.query("select pg_try_advisory_lock($1) as locked", [advisoryLockId]);
    locked = lockResult.rows[0]?.locked === true;
    if (!locked) {
      console.log("PLM synchronization is already running; skipping this timer tick");
      return;
    }
    const run = await client.query(
      "insert into inventory_sync_runs (source, status, details) values ($1, 'running', $2::jsonb) returning id",
      [source, JSON.stringify({ baseUrl, styleUrls, rootUrl, scopeName })]
    );
    runId = run.rows[0].id;
    const snapshot = await fetchPlmSnapshot({ baseUrl, username, password, styleUrls, rootUrl, scopeName });
    const syncedAt = new Date().toISOString();

    await client.query("begin");
    const current = await client.query("select data from inventory_platform_state where id = 'default' for update");
    if (!current.rows[0]?.data) throw new Error("Inventory platform state has not been initialized");
    const merged = mergePlmSnapshot(current.rows[0].data, snapshot);
    await client.query(
      "insert into inventory_platform_state_history (state_id, data, source) values ('default', $1::jsonb, $2)",
      [JSON.stringify(current.rows[0].data), source]
    );
    await client.query("update inventory_platform_state set data = $1::jsonb, updated_at = now() where id = 'default'", [JSON.stringify(merged.document)]);

    for (const style of snapshot.styles) {
      await client.query(
        `insert into plm_styles (plm_style_id, spu, ja_style_no, product_name, sizes, modified_at_source, last_seen_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, now())
         on conflict (plm_style_id) do update set spu=excluded.spu, ja_style_no=excluded.ja_style_no,
           product_name=excluded.product_name, sizes=excluded.sizes, modified_at_source=excluded.modified_at_source, last_seen_at=now()`,
        [style.plmStyleId, style.spu, style.jaStyleNo || null, style.productName, JSON.stringify(style.sizes), style.modifiedAt]
      );
      for (const colorway of style.colorways) {
        const result = merged.result.colorwayResults.find((item) => item.plmColorwayId === colorway.plmColorwayId);
        await client.query(
          `insert into plm_colorways (plm_colorway_id, plm_style_id, color_name, source_color_code, inventory_product_id, sync_status, modified_at_source, last_seen_at)
           values ($1, $2, $3, $4, $5, $6, $7, now())
           on conflict (plm_colorway_id) do update set plm_style_id=excluded.plm_style_id, color_name=excluded.color_name,
             source_color_code=excluded.source_color_code, inventory_product_id=excluded.inventory_product_id,
             sync_status=excluded.sync_status, modified_at_source=excluded.modified_at_source, last_seen_at=now()`,
          [colorway.plmColorwayId, style.plmStyleId, colorway.colorName, colorway.sourceColorCode || null,
            result?.inventoryProductId || null, result?.status || "not_materialized", colorway.modifiedAt]
        );
      }
    }
    await client.query(
      "delete from inventory_platform_state_history where revision_id not in (select revision_id from inventory_platform_state_history order by created_at desc limit 200)"
    );
    await client.query("commit");
    await client.query(
      "update inventory_sync_runs set status='succeeded', sku_count=$1, details=$2::jsonb, finished_at=now() where id=$3",
      [merged.result.createdProducts + merged.result.updatedProducts, JSON.stringify({ ...merged.result, colorwayResults: undefined, syncedAt }), runId]
    );
    console.log(`PLM synchronization succeeded: ${merged.result.styleCount} styles, ${merged.result.createdProducts} products created, ${merged.result.updatedProducts} updated, ${merged.result.blockedColorways} waiting for color codes`);
  } catch (error) {
    try { await client.query("rollback"); } catch (_) { /* No active transaction. */ }
    if (runId) {
      await client.query(
        "update inventory_sync_runs set status='failed', details=$1::jsonb, finished_at=now() where id=$2",
        [JSON.stringify({ baseUrl, styleUrls, rootUrl, scopeName, error: String(error?.message || error).slice(0, 1000) }), runId]
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
  console.error("PLM synchronization failed", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
