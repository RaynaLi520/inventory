import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCozRecordPayload, patchPageRequest } from "./coz-records-core.js";

test("normalizes and sorts external CoZ records by newest date", () => {
  const records = normalizeCozRecordPayload({ Data: [
    { SKU: "SKU-OLD", 采购单号: "PO-100", 数量: 3, 日期: "2026-08-01" },
    { SKU: "SKU-NEW", 采购单号: "PO-101", 数量: 5, 日期: "2026-08-03" }
  ] }, "purchase");
  assert.equal(records[0].sku, "SKU-NEW");
  assert.equal(records[0].purchaseOrder, "PO-101");
  assert.equal(records[0].quantity, 5);
  assert.equal(records[0].kind, "purchase");
});

test("patches Forguncy pagination without mutating the template", () => {
  const template = { offsetConditionInfo: { targetPage: 1 }, currentDataLength: 23 };
  const next = patchPageRequest(template, 4, 500);
  assert.equal(next.offsetConditionInfo.targetPage, 4);
  assert.equal(next.currentDataLength, 0);
  assert.equal(next.offsetConditionInfo.pageLimitRowCount, 500);
  assert.equal(template.offsetConditionInfo.targetPage, 1);
});

test("supports explicit column mappings for Forguncy C columns", () => {
  const [record] = normalizeCozRecordPayload({ Data: [{ C2: "COZAW26-KST111-LB-S", C4: "生产单-001", C7: 12, C9: "2026-08-20" }] }, "purchase", {
    sku: "C2", purchaseOrder: "C4", quantity: "C7", recordedAt: "C9"
  });
  assert.equal(record.sku, "COZAW26-KST111-LB-S");
  assert.equal(record.purchaseOrder, "生产单-001");
  assert.equal(record.quantity, 12);
  assert.equal(record.recordedAt, "2026-08-20T00:00:00.000Z");
});
