import { fetchPlmSnapshot } from "../server/plm-client.js";
import { mergePlmSnapshot } from "../server/plm-sync-core.js";

const stateUrl = process.env.INVENTORY_STATE_URL || "https://inventory.justinallen.com/api/state";
const response = await fetch(stateUrl, { headers: { Accept: "application/json" } });
if (!response.ok) throw new Error(`Inventory API returned HTTP ${response.status}`);
const payload = await response.json();
const document = payload.data?.data || payload.data;
const snapshot = await fetchPlmSnapshot();
const merged = mergePlmSnapshot(document, snapshot);
const selectedSpus = new Set(snapshot.styles.map((style) => style.spu));

console.log(JSON.stringify({
  result: { ...merged.result, colorwayResults: undefined },
  products: merged.document.state.products
    .filter((product) => selectedSpus.has(product.sourceBaseSku || product.style || product.baseSku))
    .map((product) => ({
      id: product.id,
      sourceOrigin: product.sourceOrigin,
      spu: product.baseSku,
      name: product.name,
      color: product.color,
      colorCode: product.colorCode,
      sizes: product.sizes,
      skuBySize: product.skuBySize,
      warehouse: product.warehouse
    }))
}, null, 2));
