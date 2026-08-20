import test from "node:test";
import assert from "node:assert/strict";
import { mergePlmSnapshot } from "./plm-sync-core.js";

function fixture() {
  return {
    state: {
      products: [{
        id: "COZ-WPT147-PKS", sourceOrigin: "coz", sourceBaseSku: "COZAW26-WPT147",
        style: "COZAW26-WPT147", originalStyle: "COZAW26-WPT147", baseSku: "COZAW26-WPT147",
        name: "旧名称", category: "Pant", color: "粉色条纹", colorCode: "PKS",
        sizes: { M: 10 }, localSizes: {}, skuBySize: { M: "COZAW26-WPT147-PKS-M" },
        sourceSkuBySize: { M: "1003213100356013" }, warehouse: 10, store: 0, reserved: 0
      }],
      movements: [], bundles: [], trashProducts: [], deletedProductKeys: []
    },
    colorMappings: { "粉色条纹": "PKS", "白底小熊": "WBR" },
    itemTypeCodes: { Pant: "PT", Shirt: "ST" },
    fabricTypeCodes: { Woven: "W", Knit: "K" }
  };
}

test("PLM merge preserves stock and fills missing size SKUs without exposing PLM IDs", () => {
  const merged = mergePlmSnapshot(fixture(), { styles: [{
    plmStyleId: "C1003213", spu: "COZAW26-WPT147", productName: "棉莫色织条纹长裤", sizes: ["S", "M", "L"],
    colorways: [{ plmColorwayId: "C1003560", colorName: "粉色条纹" }]
  }] });
  const product = merged.document.state.products[0];
  assert.deepEqual(product.sizes, { M: 10, S: 0, L: 0 });
  assert.equal(product.warehouse, 10);
  assert.equal(product.sourceSkuBySize.M, "1003213100356013");
  assert.equal(product.skuBySize.S, "COZAW26-WPT147-PKS-S");
  assert.equal(product.skuBySize.L, "COZAW26-WPT147-PKS-L");
  assert.equal(product.name, "棉莫色织条纹长裤");
  assert.equal("plmStyleId" in product, false);
  assert.equal("plmColorwayId" in product, false);
});

test("PLM merge creates mapped SKCs and stages unmapped colors", () => {
  const merged = mergePlmSnapshot(fixture(), { styles: [{
    plmStyleId: "C1011431", spu: "COZAW26-KST111", productName: "圆领长袖T恤", sizes: ["S", "M", "L"],
    colorways: [
      { plmColorwayId: "C1011501", colorName: "白底小熊" },
      { plmColorwayId: "C1011502", colorName: "未映射颜色" }
    ]
  }] });
  const created = merged.document.state.products.find((product) => product.sourceBaseSku === "COZAW26-KST111");
  assert.equal(created.sourceOrigin, "plm");
  assert.equal(created.category, "Shirt");
  assert.deepEqual(created.sizes, { S: 0, M: 0, L: 0 });
  assert.equal(created.skuBySize.M, "COZAW26-KST111-WBR-M");
  assert.equal(merged.result.createdProducts, 1);
  assert.equal(merged.result.blockedColorways, 1);
  assert.equal(merged.result.colorwayResults[1].status, "needs_color_code");
});

test("PLM can recreate a style after its recycle-bin record was purged", () => {
  const document = fixture();
  document.state.deletedProductKeys = ['["cozaw26-kst111","白底小熊"]'];
  const merged = mergePlmSnapshot(document, { styles: [{
    plmStyleId: "C1011431", spu: "COZAW26-KST111", productName: "圆领长袖T恤", sizes: ["S"],
    colorways: [{ plmColorwayId: "C1011501", colorName: "白底小熊" }]
  }] });
  assert.equal(merged.document.state.products.some((product) => product.sourceBaseSku === "COZAW26-KST111"), true);
});
