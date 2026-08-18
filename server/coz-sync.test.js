import assert from "node:assert/strict";
import test from "node:test";
import { assertCompleteCozSnapshot, mergeCozSnapshot, normalizeCozResponse, normalizeSize } from "./coz-sync-core.js";

function row(overrides = {}) {
  return {
    C0: "1", C1: "CoZ", C3: "COZAW26-WPT147", C4: "Light Blue/浅蓝色", C5: "Free Size",
    C15: 10, C16: 1, C24: "1001", C25: "UPC1", C29: "Test product", Query: '{"SKU":"1001"}',
    ...overrides
  };
}

function response(rows, allRowsLoaded = true) {
  return { table: { Data: rows, AllRowLoaded: allRowsLoaded } };
}

function document() {
  return {
    version: 1,
    colorMappings: { "Light Blue/浅蓝色": "LB2" },
    stockLocations: [{ id: "warehouse", name: "上海总仓", type: "warehouse" }],
    stockHistory: [{ day: "2026-08-16", available: 8 }],
    state: {
      productIdVersion: 2,
      products: [
        { id: "MANUAL-1", sourceOrigin: "manual", baseSku: "LOCAL-1", color: "黑色", sizes: { F: 2 } },
        {
          id: "COZ-EXISTING", sourceOrigin: "coz", sourceBaseSku: "COZAW26-WPT147", style: "COZAW26-WPT147",
          originalStyle: "OLD-STYLE", baseSku: "BRAND-SPU", name: "Edited name", category: "Pant", color: "Light Blue/浅蓝色",
          colorCode: "LB2", safety: 5, image: "/media/test.jpg", imageName: "test.jpg",
          skuBySize: { F: "BRAND-SKU-F", M: "9988776655", XL: "BRAND-SPU-LB2-XL" },
          localSizes: { XL: 3 }, sizes: { F: 8, XL: 3 }, warehouse: 11, store: 2, locationStock: { warehouse: 11 }
        }
      ],
      movements: [{ id: "IN-1" }],
      bundles: [{ id: "B1", components: ["COZ-EXISTING"] }],
      trashProducts: [{ id: "TRASH-1", sourceBaseSku: "OLD", color: "Red", deletedSourceKey: '["old","red"]' }],
      deletedProductKeys: ['["deleted","black"]'],
      trashBundles: [{ id: "TB1" }],
      deletedBundleIds: ["B2"]
    }
  };
}

test("normalizes CoZ rows, exact brand and Free Size", () => {
  assert.equal(normalizeSize("Free Size"), "F");
  const snapshot = normalizeCozResponse(response([
    row(),
    row(),
    row({ C1: "coz", C24: "2001", Query: '{"SKU":"2001"}' })
  ]));
  assert.equal(snapshot.skuCount, 1);
  assert.equal(snapshot.duplicateRowCount, 1);
  assert.equal(snapshot.inventory[0].size, "F");
  assert.equal(snapshot.inventory[0].stockedQuantity, 10);
});

test("rejects duplicate source SKUs with conflicting stock", () => {
  assert.throws(() => normalizeCozResponse(response([row(), row({ C15: 11 })])), /Conflicting stock/);
});

test("rejects incomplete CoZ responses", () => {
  const snapshot = normalizeCozResponse(response([row()], false));
  assert.throws(() => assertCompleteCozSnapshot(snapshot), /incomplete/);
});

test("merges source inventory while preserving user-owned platform data", () => {
  const snapshot = normalizeCozResponse(response([row()]));
  const merged = mergeCozSnapshot(document(), snapshot, "2026-08-17T00:00:00.000Z");
  const product = merged.state.products.find((item) => item.id === "COZ-EXISTING");
  assert.equal(product.name, "Edited name");
  assert.equal(product.baseSku, "OLD-STYLE");
  assert.equal(product.image, "/media/test.jpg");
  assert.deepEqual(product.skuBySize, { F: "BRAND-SKU-F", XL: "OLD-STYLE-LB2-XL" });
  assert.deepEqual(product.sourceSkuBySize, { F: "1001" });
  assert.deepEqual(product.sizes, { F: 10, XL: 3 });
  assert.equal(product.warehouse, 13);
  assert.deepEqual(merged.state.movements, [{ id: "IN-1" }]);
  assert.deepEqual(merged.state.bundles, [{ id: "B1", components: ["COZ-EXISTING"] }]);
  assert.equal(merged.state.trashProducts.length, 1);
  assert.deepEqual(merged.stockLocations, document().stockLocations);
  assert.deepEqual(merged.stockHistory, document().stockHistory);
 assert.equal(merged.state.source.mode, "direct-api");
  assert.equal(merged.state.spuRuleVersion, 2);
  assert.equal(merged.state.brandSkuRuleVersion, 2);
});

test("keeps deleted products excluded and gives new products deterministic IDs", () => {
  const base = document();
  base.state.deletedProductKeys.push('["cozaw26-wpt148","black/黑色"]');
  const snapshot = normalizeCozResponse(response([
    row({ C3: "COZAW26-WPT148", C4: "Black/黑色", C24: "2001", Query: '{"SKU":"2001"}' }),
    row({ C3: "COZAW26-WPT149", C4: "Black/黑色", C24: "3001", Query: '{"SKU":"3001"}' })
  ]));
  const first = mergeCozSnapshot(base, snapshot);
  const second = mergeCozSnapshot(base, snapshot);
  assert.equal(first.state.products.some((product) => product.sourceBaseSku === "COZAW26-WPT148"), false);
  const firstNew = first.state.products.find((product) => product.sourceBaseSku === "COZAW26-WPT149");
  const secondNew = second.state.products.find((product) => product.sourceBaseSku === "COZAW26-WPT149");
  assert.equal(firstNew.id, secondNew.id);
});

test("mirrors CoZ SET styles into fixed bundles without removing products", () => {
  const snapshot = normalizeCozResponse(response([
    row({ C3: "COZSS26-WSET068", C4: "粉红条纹", C5: "L", C15: 8, C16: 0, C24: "8001", Query: '{"SKU":"8001"}' })
  ]));
  const merged = mergeCozSnapshot(document(), snapshot, "2026-08-17T00:00:00.000Z");
  const product = merged.state.products.find((item) => item.sourceBaseSku === "COZSS26-WSET068");
  const bundle = merged.state.bundles.find((item) => item.sourceSetKey === JSON.stringify(["cozss26-wset068", "粉红条纹"]));
  assert.ok(product);
  assert.ok(bundle);
  assert.equal(bundle.type, "fixed");
  assert.equal(bundle.fixedSku, "COZSS26-WSET068");
  assert.equal(bundle.fixedStock, 8);
  assert.deepEqual(bundle.fixedStockBySize, { L: 8 });
  assert.equal(merged.state.products.some((item) => item.sourceBaseSku === "COZSS26-WSET068"), true);
  const repeated = mergeCozSnapshot(merged, snapshot, "2026-08-17T00:01:00.000Z");
  assert.equal(repeated.state.bundles.filter((item) => item.sourceSetKey === bundle.sourceSetKey).length, 1);
});
