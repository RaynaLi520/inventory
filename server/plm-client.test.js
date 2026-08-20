import test from "node:test";
import assert from "node:assert/strict";
import { discoverCozStyleUrls } from "./plm-client.js";

test("PLM discovery matches the CoZ scope regardless of configured case", async () => {
  const nodes = new Map([
    ["ROOT", { Hierarchy: ["SEASON"] }],
    ["SEASON", { Hierarchy: ["CATEGORY"] }],
    ["CATEGORY", { $Name: "CoZ", Hierarchy: ["COLLECTION"] }],
    ["COLLECTION", { Hierarchy: ["STYLE25", "STYLE27", "STYLE28", "OTHER"] }],
    ["STYLE25", { $Type: "Style", Active: true, C8_Style_CozCode: "COZSS25-WPT001" }],
    ["STYLE27", { $Type: "Style", Active: true, C8_Style_CozCode: "COZAW27-WPT002" }],
    ["STYLE28", { $Type: "Style", Active: true, C8_Style_CozCode: "COZSS28-KST003" }],
    ["OTHER", { $Type: "Style", Active: true, C8_Style_CozCode: "OTHERAW28-WPT004" }]
  ]);
  const client = { getNode: async (id) => nodes.get(id) };

  assert.deepEqual(await discoverCozStyleUrls(client, "ROOT", "CoZ"), ["STYLE25", "STYLE27", "STYLE28"]);
  assert.deepEqual(await discoverCozStyleUrls(client, "ROOT", "COZ"), ["STYLE25", "STYLE27", "STYLE28"]);
});
