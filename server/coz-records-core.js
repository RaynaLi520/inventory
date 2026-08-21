import crypto from "node:crypto";

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(clean(value).replace(/[,$\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function excelDate(value) {
  const serial = numeric(value);
  if (!serial || serial < 20000 || serial > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
}

function fieldEntries(row) {
  return Object.entries(row || {}).filter(([, value]) => value !== null && value !== undefined && clean(value) !== "");
}

function fieldName(key) {
  return clean(key).toLowerCase().replace(/[\s_\-]/g, "");
}

function firstField(row, patterns) {
  const entries = fieldEntries(row);
  for (const pattern of patterns) {
    const match = entries.find(([key]) => pattern.test(fieldName(key)));
    if (match) return match[1];
  }
  return undefined;
}

function firstMatchingValue(row, pattern) {
  return fieldEntries(row).find(([, value]) => pattern.test(clean(value)))?.[1];
}

function parseDate(value) {
  const excel = excelDate(value);
  if (excel) return excel;
  const text = clean(value);
  if (!text) return null;
  const timestamp = Date.parse(text.replace(/[年\/]/g, "-").replace(/月/g, "-").replace(/日/g, ""));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function extractRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const candidate of [payload?.table?.Data, payload?.Data, payload?.data?.Data, payload?.rows, payload?.data?.rows]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

export function patchPageRequest(request, page) {
  const next = JSON.parse(JSON.stringify(request || {}));
  const offset = next.offsetConditionInfo || (next.offsetConditionInfo = {});
  offset.targetPage = page;
  if (next.currentDataLength !== undefined) next.currentDataLength = 0;
  return next;
}

export function responseHasMore(payload, rowCount, pageSize) {
  if (payload?.AllRowLoaded === true || payload?.table?.AllRowLoaded === true || payload?.allRowLoaded === true) return false;
  const total = Number(payload?.TotalRowCount ?? payload?.table?.TotalRowCount ?? payload?.totalRowCount);
  if (Number.isFinite(total) && total > 0) return rowCount < total;
  return rowCount >= pageSize && pageSize > 0;
}

function sourceKey(row, index, kind) {
  const sourceId = firstField(row, [/^(?:id|key|rowid|recordid)$/i, /编号|单号|流水号/]);
  if (sourceId !== undefined) return `${kind}:${clean(sourceId)}`;
  const digest = crypto.createHash("sha1").update(JSON.stringify(row)).digest("hex").slice(0, 20);
  return `${kind}:${digest}:${index}`;
}

export function normalizeCozRecordRows(rows, kind) {
  const seen = new Set();
  return rows.map((row, index) => {
    const sku = clean(firstField(row, [/sku|stockkeepingunit|商品编码|货号|款号/])) || clean(firstMatchingValue(row, /(?:^|[-_])(?:[A-Z]{2,}\d|\d{8,}|[A-Z]{2,}[-_][A-Z0-9]+)(?:[-_]|$)/i));
    const purchaseOrder = clean(firstField(row, [/采购单|采购订单|生产订单|生产单|订单号|po(?:number|no)?/])) || clean(firstMatchingValue(row, /\bPO[-\s]?[A-Z0-9-]{4,}\b/i));
    const quantityValue = firstField(row, [/数量|qty|quantity|入库数|计划数|采购数/]);
    const recordedAt = parseDate(firstField(row, [/时间|日期|date|time|入库时间|计划时间|创建时间|审核时间|单据时间/]));
    const key = sourceKey(row, index, kind);
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      sourceKey: key,
      kind,
      sku,
      purchaseOrder,
      quantity: quantityValue === undefined ? null : numeric(quantityValue),
      recordedAt,
      raw: row
    };
  }).filter(Boolean).sort((left, right) => String(right.recordedAt || "").localeCompare(String(left.recordedAt || "")) || left.sourceKey.localeCompare(right.sourceKey));
}

export function normalizeCozRecordPayload(payload, kind) {
  return normalizeCozRecordRows(extractRows(payload), kind);
}
