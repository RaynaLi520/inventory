const PRODUCT_ID_VERSION = 2;

function clean(value) {
  return String(value ?? "").trim();
}

function numeric(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(clean(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(value) {
  const number = numeric(value);
  return Number.isInteger(number) ? number : Number(number.toFixed(4));
}

export function normalizeSize(value) {
  const size = clean(value) || "F";
  return /^(?:free(?:\s*size|\s*尺码)?|均码|one\s*size|os)$/i.test(size) ? "F" : size.toUpperCase();
}

function excelDate(value) {
  const serial = numeric(value);
  if (!serial) return null;
  return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString();
}

function querySku(row) {
  try {
    const query = typeof row?.Query === "string" ? JSON.parse(row.Query) : row?.Query;
    const sku = clean(query?.SKU);
    if (sku) return sku;
  } catch (_) {
    // Fall back to the bound SKU column when Forguncy returns malformed Query data.
  }
  return clean(row?.C24);
}

function chooseValue(rows, key) {
  return rows.find((row) => row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== "")?.[key];
}

function uniqueValues(rows, key, transform = clean) {
  return new Set(rows
    .filter((row) => row?.[key] !== null && row?.[key] !== undefined && row?.[key] !== "")
    .map((row) => transform(row[key])));
}

function normalizeSkuGroup(sku, rows) {
  const stockValues = uniqueValues(rows, "C15", compactNumber);
  const reservedValues = uniqueValues(rows, "C16", compactNumber);
  if (stockValues.size > 1) throw new Error(`Conflicting stock quantities for CoZ SKU ${sku}`);
  if (reservedValues.size > 1) throw new Error(`Conflicting reserved quantities for CoZ SKU ${sku}`);

  const style = clean(chooseValue(rows, "C3")) || clean(chooseValue(rows, "C2"));
  const color = clean(chooseValue(rows, "C4")) || "未设置颜色";
  const size = normalizeSize(chooseValue(rows, "C5"));
  const identities = new Set(rows.map((row) => JSON.stringify([
    clean(row?.C3) || clean(row?.C2),
    clean(row?.C4) || "未设置颜色",
    normalizeSize(row?.C5)
  ])));
  if (identities.size > 1) throw new Error(`Conflicting product identity for CoZ SKU ${sku}`);
  if (!style) throw new Error(`CoZ SKU ${sku} has no style number`);

  const productName = clean(chooseValue(rows, "C29"));
  const styleNote = clean(chooseValue(rows, "C28"));
  return {
    sku,
    brand: clean(chooseValue(rows, "C1")),
    category: clean(chooseValue(rows, "C0")) === "1" ? "成衣" : clean(chooseValue(rows, "C0")),
    styleNo: style,
    productName: productName || styleNote || style,
    color,
    size,
    stockedQuantity: compactNumber([...stockValues][0] || 0),
    reservedQuantity: compactNumber([...reservedValues][0] || 0),
    reservedReported: reservedValues.size > 0,
    retailPrice: compactNumber(chooseValue(rows, "C23")),
    upc: clean(chooseValue(rows, "C25")),
    primaryFabric: clean(chooseValue(rows, "C26")),
    imagePath: clean(chooseValue(rows, "C22")),
    sourceUpdatedAt: excelDate(chooseValue(rows, "C27")),
    styleNote,
    customerProductName: productName,
    sourceRowCount: rows.length
  };
}

export function normalizeCozResponse(payload, brand = "CoZ") {
  const table = payload?.table || payload;
  if (!Array.isArray(table?.Data)) throw new Error("CoZ response does not contain table.Data rows");
  const rows = table.Data;
  const selected = rows.filter((row) => clean(row?.C1) === brand);
  const grouped = new Map();
  selected.forEach((row) => {
    const sku = querySku(row);
    if (!sku) return;
    if (!grouped.has(sku)) grouped.set(sku, []);
    grouped.get(sku).push(row);
  });
  const inventory = [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sku, skuRows]) => normalizeSkuGroup(sku, skuRows));
  return {
    source: "CoZ Forguncy inventory",
    brand,
    allRowsLoaded: table.AllRowLoaded === true,
    sourceRowCount: rows.length,
    brandRowCount: selected.length,
    skuCount: inventory.length,
    duplicateRowCount: selected.length - inventory.length,
    stockedQuantity: compactNumber(inventory.reduce((sum, item) => sum + item.stockedQuantity, 0)),
    reservedQuantity: compactNumber(inventory.reduce((sum, item) => sum + item.reservedQuantity, 0)),
    inventory
  };
}

export function assertCompleteCozSnapshot(snapshot) {
  if (!snapshot?.allRowsLoaded) throw new Error("CoZ response is incomplete (AllRowLoaded is not true)");
  if (!Array.isArray(snapshot.inventory) || !snapshot.inventory.length) throw new Error("CoZ response contains no CoZ inventory SKUs");
  if (!Number.isInteger(snapshot.sourceRowCount) || snapshot.sourceRowCount < snapshot.inventory.length) {
    throw new Error("CoZ response row counts are invalid");
  }
}

function sourceColorKey(source, color) {
  return JSON.stringify([clean(source).toLowerCase(), clean(color).toLowerCase()]);
}

function migrateProductSourceKey(value) {
  const key = clean(value);
  if (!key) return "";
  if (key.includes("\u0000")) {
    const separator = key.indexOf("\u0000");
    return sourceColorKey(key.slice(0, separator), key.slice(separator + 1));
  }
  try {
    const parts = JSON.parse(key);
    if (Array.isArray(parts) && parts.length === 2) return sourceColorKey(parts[0], parts[1]);
  } catch (_) {
    // Preserve unknown legacy keys so deleted products remain excluded.
  }
  return key.toLowerCase();
}

function productSourceKey(product) {
  return sourceColorKey(
    product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku,
    product?.color
  );
}

function deletedSourceKeysForState(state) {
  const trashKeys = new Set((state?.trashProducts || [])
    .map((product) => migrateProductSourceKey(product.deletedSourceKey || productSourceKey(product)))
    .filter(Boolean));
  const explicitKeys = (state?.deletedProductKeys || [])
    .map(migrateProductSourceKey)
    .filter((key) => trashKeys.has(key));
  return new Set([...trashKeys, ...explicitKeys]);
}

function stableToken(value) {
  const normalized = clean(value).toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (normalized) return normalized;
  let hash = 2166136261;
  for (const character of String(value || "")) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return `C${(hash >>> 0).toString(36).toUpperCase()}`;
}

function stableProductId(product, colorMappings) {
  const style = product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku || "PRODUCT";
  const color = product?.colorCode || colorMappings?.[product?.color] || product?.color || "COLOR";
  return `COZ-${stableToken(style)}-${stableToken(color)}`;
}

function resolveColorAppearance(value) {
  const color = clean(value).toLowerCase();
  const rules = [
    [/黑|墨|炭|black|charcoal/, "#303432"], [/藏青|海军|深海|navy/, "#344b61"],
    [/蓝|blue|denim/, "#6f97b2"], [/粉|pink|rose/, "#d99aa9"],
    [/红|莓|red|raspberry|burgundy/, "#b96067"], [/紫|purple|lavender|lilac/, "#8c789e"],
    [/绿|苔|green|olive|moss/, "#78917b"], [/黄|yellow|gold/, "#d2ad45"],
    [/橙|orange|coral/, "#cc805f"], [/咖|棕|褐|brown|coffee|chocolate/, "#94735f"],
    [/米|燕麦|卡其|beige|oat|khaki|sand/, "#c8b99e"], [/灰|银|石灰|gray|grey|silver/, "#969c99"],
    [/白|象牙|乳白|white|ivory|cream/, "#f4f3ed"]
  ];
  const hex = rules.find(([pattern]) => pattern.test(color))?.[1] || "#8a918d";
  const pattern = /条纹|白条|间条|stripe|striped|gingham|check|格纹|格子/.test(color) ? "stripe" : "";
  return { hex, accent: "#eef2ef", pattern };
}

function sourceProductFromGroup(items, colorMappings) {
  const first = items[0];
  const appearance = resolveColorAppearance(first.color);
  const product = {
    name: first.productName || first.styleNote || first.styleNo,
    category: first.category || "成衣",
    style: first.styleNo,
    baseSku: first.styleNo,
    sourceBaseSku: first.styleNo,
    sourceOrigin: "coz",
    color: first.color,
    colorCode: colorMappings?.[first.color] || "",
    colorHex: appearance.hex,
    colorAccent: appearance.accent,
    colorPattern: appearance.pattern,
    safety: 0,
    sizes: {},
    reservedBySize: {},
    skuBySize: {},
    sourceSkuBySize: {},
    warehouse: 0,
    store: 0,
    reserved: 0,
    reservedReported: false,
    sourceUpdatedAt: null,
    sourceImagePath: "",
    sourceDetailsBySize: {}
  };
  items.forEach((item) => {
    const size = normalizeSize(item.size);
    product.sizes[size] = compactNumber((product.sizes[size] || 0) + item.stockedQuantity);
    product.reservedBySize[size] = compactNumber((product.reservedBySize[size] || 0) + item.reservedQuantity);
    product.sourceSkuBySize[size] = String(item.sku);
    if (product.colorCode) product.skuBySize[size] = `${product.baseSku}-${product.colorCode}-${size}`;
    product.sourceDetailsBySize[size] = {
      upc: item.upc || "",
      retailPrice: item.retailPrice || 0,
      primaryFabric: item.primaryFabric || "",
      sourceRowCount: item.sourceRowCount || 1
    };
    product.warehouse = compactNumber(product.warehouse + item.stockedQuantity);
    product.reserved = compactNumber(product.reserved + item.reservedQuantity);
    product.reservedReported ||= Boolean(item.reservedReported);
    if (!product.sourceImagePath && item.imagePath) product.sourceImagePath = item.imagePath;
    if (item.sourceUpdatedAt && (!product.sourceUpdatedAt || item.sourceUpdatedAt > product.sourceUpdatedAt)) {
      product.sourceUpdatedAt = item.sourceUpdatedAt;
    }
  });
  return product;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isFixedSetStyle(product) {
  const style = clean(product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku);
  return /SET\d*(?:-|$)/i.test(style);
}

function fixedSetStock(product) {
  const total = Object.values(product?.sizes || {}).reduce((sum, quantity) => sum + numeric(quantity), 0);
  return compactNumber(Math.max(0, total - numeric(product?.reserved)));
}

// CoZ SET styles are already sold as complete bundles. Mirror each style/color
// into a fixed bundle while retaining the original product for auditability.
export function migrateFixedSetBundles(document) {
  const state = document?.state;
  if (!state || !Array.isArray(state.products)) return false;
  if (!Array.isArray(state.bundles)) state.bundles = [];
  const deletedBundleIds = new Set((state.deletedBundleIds || []).map(String));
  let changed = false;
  state.products.filter(isFixedSetStyle).forEach((product) => {
    const sourceStyle = clean(product.sourceBaseSku || product.style || product.originalStyle || product.baseSku);
    const color = clean(product.color);
    const sourceSetKey = sourceColorKey(sourceStyle, color);
    const bundleId = `COZ-SET-${stableToken(sourceStyle)}-${stableToken(color || "COLOR")}`;
    if (deletedBundleIds.has(bundleId)) return;
    let bundle = state.bundles.find((item) => item.sourceSetKey === sourceSetKey)
      || state.bundles.find((item) => item.id === bundleId);
    const now = new Date().toISOString();
    const next = {
      ...(bundle || {}),
      id: bundle?.id || bundleId,
      name: product.name || sourceStyle,
      type: "fixed",
      season: (sourceStyle.match(/^COZ(SS|AW)\d{2}/i)?.[1] || "").toUpperCase(),
      color,
      colorCode: clean(product.colorCode).toUpperCase(),
      size: "",
      fixedSku: sourceStyle,
      fixedStock: fixedSetStock(product),
      fixedStockBySize: { ...(product.sizes || {}) },
      fixedWarehouse: numeric(product.warehouse),
      fixedStore: numeric(product.store),
      fixedReserved: numeric(product.reserved),
      sourceOrigin: "coz",
      sourceSetKey,
      sourceProductId: product.id,
      sourceUpdatedAt: product.sourceUpdatedAt || now,
      components: [],
      componentSkus: [],
      componentSourceSkus: [],
      componentColors: [],
      componentSizes: [],
      componentCodes: [],
      createdAt: bundle?.createdAt || now,
      updatedAt: now
    };
    if (!bundle) {
      state.bundles.push(next);
      changed = true;
      return;
    }
    if (JSON.stringify(bundle) !== JSON.stringify(next)) {
      Object.assign(bundle, next);
      changed = true;
    }
  });
  return changed;
}

export function mergeCozSnapshot(document, snapshot, syncedAt = new Date().toISOString()) {
  assertCompleteCozSnapshot(snapshot);
  if (!document?.state || !Array.isArray(document.state.products)) throw new Error("Inventory platform document is invalid");

  const nextDocument = clone(document);
  const previousState = nextDocument.state;
  const currentProducts = previousState.products || [];
  const trashProducts = Array.isArray(previousState.trashProducts) ? previousState.trashProducts : [];
  const deletedSourceKeys = deletedSourceKeysForState(previousState);
  const manualProducts = currentProducts.filter((product) => product.sourceOrigin === "manual" && !product.sourceBaseSku);
  const mappingBySource = new Map(currentProducts
    .filter((product) => product.sourceBaseSku || product.sourceOrigin === "coz")
    .map((product) => [productSourceKey(product), product]));
  const groups = new Map();
  snapshot.inventory.forEach((item) => {
    const key = sourceColorKey(item.styleNo, item.color);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  // PLM can create a catalog row before the style has any CoZ inventory. Keep
  // those zero-stock rows until the source API contains the same style/color;
  // once it does, mappingBySource merges both records under the existing ID.
  const pendingPlmProducts = currentProducts.filter((product) => product.sourceOrigin === "plm" && !groups.has(productSourceKey(product)));
  const preservedProducts = [...manualProducts, ...pendingPlmProducts];

  const usedIds = new Set(preservedProducts.map((product) => String(product.id || "")).filter(Boolean));
  const syncedProducts = [...groups.entries()]
    .filter(([key]) => !deletedSourceKeys.has(key))
    .map(([key, items]) => {
      const sourceProduct = sourceProductFromGroup(items, nextDocument.colorMappings || {});
      const mapping = mappingBySource.get(key);
      if (!mapping) {
        let id = stableProductId(sourceProduct, nextDocument.colorMappings || {});
        let suffix = 2;
        while (usedIds.has(id)) id = `${stableProductId(sourceProduct, nextDocument.colorMappings || {})}-${suffix++}`;
        usedIds.add(id);
        return { id, ...sourceProduct };
      }

      usedIds.add(String(mapping.id || ""));
      const localSizes = { ...(mapping.localSizes || {}) };
      // Source inventory owns a size as soon as CoZ reports it. PLM may have
      // initialized that same size to zero, but it must not overwrite source
      // stock during the next CoZ merge. Keep local quantities only for sizes
      // absent from the source snapshot.
      const sizes = { ...sourceProduct.sizes };
      Object.entries(localSizes).forEach(([size, quantity]) => {
        if (!Object.hasOwn(sizes, size)) sizes[size] = quantity;
      });
      const localOnlyQuantity = Object.entries(localSizes)
        .filter(([size]) => !Object.hasOwn(sourceProduct.sizes, size))
        .reduce((sum, [, quantity]) => sum + numeric(quantity), 0);
      const actualSpu = String(mapping.originalStyle || mapping.baseSku || sourceProduct.baseSku || "").trim();
      const previousSpu = String(mapping.baseSku || "").trim();
      const skuBySize = Object.fromEntries(Object.entries(mapping.skuBySize || {}).flatMap(([size, sku]) => {
        const value = String(sku || "");
        if (/^\d+$/.test(value.trim())) return [];
        return [[size, previousSpu && actualSpu && value.startsWith(`${previousSpu}-`)
          ? `${actualSpu}-${value.slice(previousSpu.length + 1)}`
          : sku]];
      }));
      return {
        ...mapping,
        ...sourceProduct,
        id: mapping.id,
        name: mapping.name || sourceProduct.name,
        category: mapping.category || sourceProduct.category,
        originalStyle: mapping.originalStyle || mapping.style || sourceProduct.style,
        baseSku: actualSpu,
        spuMeta: mapping.spuMeta ? clone(mapping.spuMeta) : undefined,
        colorCode: mapping.colorCode || sourceProduct.colorCode,
        colorHex: mapping.colorHex || sourceProduct.colorHex,
        colorAccent: mapping.colorAccent || sourceProduct.colorAccent,
        colorPattern: mapping.colorPattern || sourceProduct.colorPattern,
        safety: Number(mapping.safety || 0),
        image: mapping.image || "",
        imagePath: mapping.imagePath || "",
        imageName: mapping.imageName || "",
        imageSourceName: mapping.imageSourceName || "",
        imageUpdatedAt: mapping.imageUpdatedAt || null,
        imageSyncStatus: mapping.imageSyncStatus || (mapping.image ? "available" : "missing"),
        skuBySize,
        localSizes,
        sizes,
        warehouse: compactNumber(sourceProduct.warehouse + localOnlyQuantity),
        store: Number(mapping.store || 0),
        locationStock: mapping.locationStock ? clone(mapping.locationStock) : undefined,
        sourceOrigin: "coz",
        sourceBaseSku: sourceProduct.sourceBaseSku
      };
    })
    .sort((left, right) => left.style.localeCompare(right.style) || left.color.localeCompare(right.color));

  if (!syncedProducts.length) throw new Error("CoZ synchronization produced no products");
  previousState.products = [...preservedProducts, ...syncedProducts];
  previousState.trashProducts = trashProducts;
  previousState.deletedProductKeys = [...deletedSourceKeys];
  previousState.movements = Array.isArray(previousState.movements) ? previousState.movements : [];
  previousState.bundles = Array.isArray(previousState.bundles) ? previousState.bundles : [];
  previousState.trashBundles = Array.isArray(previousState.trashBundles) ? previousState.trashBundles : [];
  previousState.deletedBundleIds = Array.isArray(previousState.deletedBundleIds) ? previousState.deletedBundleIds : [];
  migrateFixedSetBundles(nextDocument);
  previousState.productIdVersion = Math.max(Number(previousState.productIdVersion || 0), PRODUCT_ID_VERSION);
  previousState.spuRuleVersion = Math.max(Number(previousState.spuRuleVersion || 0), 2);
  previousState.brandSkuRuleVersion = Math.max(Number(previousState.brandSkuRuleVersion || 0), 2);
  previousState.source = {
    ...(previousState.source || {}),
    type: "coz",
    mode: "direct-api",
    brand: snapshot.brand,
    syncedAt,
    skuCount: snapshot.skuCount,
    stockedQuantity: snapshot.stockedQuantity,
    reservedQuantity: snapshot.reservedQuantity,
    sourceRowCount: snapshot.sourceRowCount,
    brandRowCount: snapshot.brandRowCount,
    duplicateRowCount: snapshot.duplicateRowCount,
    allRowsLoaded: true
  };
  return nextDocument;
}
