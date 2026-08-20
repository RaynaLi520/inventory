import { normalizeSize } from "./coz-sync-core.js";

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceColorKey(source, color) {
  return JSON.stringify([clean(source).toLowerCase(), clean(color).toLowerCase()]);
}

function deletedSourceKeys(state) {
  const normalizeKey = (value) => {
    const raw = clean(value);
    if (!raw) return "";
    try {
      const parts = JSON.parse(raw);
      if (Array.isArray(parts) && parts.length === 2) return sourceColorKey(parts[0], parts[1]);
    } catch (_) {
      // Preserve unknown legacy keys.
    }
    return raw.toLowerCase();
  };
  const trashKeys = new Set((state?.trashProducts || [])
    .map((product) => normalizeKey(product.deletedSourceKey || sourceColorKey(
      product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku,
      product?.color
    )))
    .filter(Boolean));
  // A tombstone is valid only while its item remains in the recycle bin.
  // This lets a permanently deleted PLM style be imported again normally.
  const explicitKeys = (state?.deletedProductKeys || [])
    .map(normalizeKey)
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
  return {
    hex: rules.find(([pattern]) => pattern.test(color))?.[1] || "#8a918d",
    accent: "#eef2ef",
    pattern: /条纹|白条|间条|stripe|striped|gingham|check|格纹|格子/.test(color) ? "stripe" : ""
  };
}

export function parsePlmSpu(spu, document = {}) {
  const normalizedSpu = clean(spu).toUpperCase();
  const match = normalizedSpu.match(/^COZ(SS|AW)(\d{2})-([A-Z])([A-Z]+?)(\d{3})$/);
  if (!match) return null;
  const itemTypeEntry = Object.entries(document.itemTypeCodes || {}).find(([, code]) => clean(code).toUpperCase() === match[4]);
  const fabricTypeEntry = Object.entries(document.fabricTypeCodes || {}).find(([, code]) => clean(code).toUpperCase() === match[3]);
  return {
    year: 2000 + Number(match[2]),
    season: match[1],
    seasonYear: `${match[1]}${match[2]}`,
    fabricType: fabricTypeEntry?.[0] || match[3],
    fabricTypeCode: match[3],
    itemType: itemTypeEntry?.[0] || "成衣",
    itemTypeCode: match[4],
    sequence: Number(match[5]),
    sequenceText: match[5],
    generatedSpu: normalizedSpu
  };
}

function productKey(product) {
  return sourceColorKey(
    product?.sourceBaseSku || product?.style || product?.originalStyle || product?.baseSku,
    product?.color
  );
}

function completeSizes(product, sizes, spu, colorCode) {
  product.sizes ||= {};
  product.localSizes ||= {};
  product.skuBySize ||= {};
  sizes.forEach((rawSize) => {
    const size = normalizeSize(rawSize);
    if (!Object.hasOwn(product.sizes, size)) product.sizes[size] = 0;
    if (!Object.hasOwn(product.localSizes, size)) product.localSizes[size] = 0;
    const currentSku = clean(product.skuBySize[size]);
    if (!currentSku || /^\d+$/.test(currentSku)) product.skuBySize[size] = `${spu}-${colorCode}-${size}`;
  });
}

function newPlmProduct(style, colorway, colorCode, meta) {
  const appearance = resolveColorAppearance(colorway.colorName);
  const product = {
    id: `PLM-${stableToken(style.spu)}-${stableToken(colorCode)}`,
    name: style.productName || style.spu,
    category: meta?.itemType || "成衣",
    style: style.spu,
    originalStyle: style.spu,
    baseSku: style.spu,
    sourceBaseSku: style.spu,
    sourceOrigin: "plm",
    color: colorway.colorName,
    colorCode,
    colorHex: appearance.hex,
    colorAccent: appearance.accent,
    colorPattern: appearance.pattern,
    safety: 0,
    sizes: {},
    localSizes: {},
    reservedBySize: {},
    skuBySize: {},
    sourceSkuBySize: {},
    warehouse: 0,
    store: 0,
    reserved: 0,
    reservedReported: false,
    spuMeta: meta || undefined
  };
  completeSizes(product, style.sizes, style.spu, colorCode);
  return product;
}

export function mergePlmSnapshot(document, snapshot) {
  if (!document?.state || !Array.isArray(document.state.products)) throw new Error("Inventory platform document is invalid");
  if (!Array.isArray(snapshot?.styles) || !snapshot.styles.length) throw new Error("PLM snapshot contains no styles");

  const nextDocument = clone(document);
  const products = nextDocument.state.products;
  const byKey = new Map(products.map((product) => [productKey(product), product]));
  const deletedKeys = deletedSourceKeys(nextDocument.state);
  const colorwayResults = [];
  let createdProducts = 0;
  let updatedProducts = 0;
  let blockedColorways = 0;

  snapshot.styles.forEach((style) => {
    const spu = clean(style.spu).toUpperCase();
    const meta = parsePlmSpu(spu, nextDocument);
    (style.colorways || []).forEach((colorway) => {
      const key = sourceColorKey(spu, colorway.colorName);
      const existing = byKey.get(key);
      const colorCode = clean(existing?.colorCode || nextDocument.colorMappings?.[colorway.colorName]).toUpperCase();
      if (deletedKeys.has(key)) {
        colorwayResults.push({ plmColorwayId: colorway.plmColorwayId, inventoryProductId: null, status: "deleted_locally", colorCode });
        return;
      }
      if (!colorCode) {
        blockedColorways += 1;
        colorwayResults.push({ plmColorwayId: colorway.plmColorwayId, inventoryProductId: null, status: "needs_color_code", colorCode: "" });
        return;
      }

      if (!existing) {
        const product = newPlmProduct({ ...style, spu }, colorway, colorCode, meta);
        products.push(product);
        byKey.set(key, product);
        createdProducts += 1;
        colorwayResults.push({ plmColorwayId: colorway.plmColorwayId, inventoryProductId: product.id, status: "created", colorCode });
        return;
      }

      existing.name = style.productName || existing.name || spu;
      existing.category = meta?.itemType || existing.category || "成衣";
      existing.sourceBaseSku ||= spu;
      existing.style ||= spu;
      existing.originalStyle ||= spu;
      existing.baseSku ||= spu;
      existing.spuMeta = { ...(existing.spuMeta || {}), ...(meta || {}) };
      completeSizes(existing, style.sizes, existing.baseSku || spu, colorCode);
      updatedProducts += 1;
      colorwayResults.push({ plmColorwayId: colorway.plmColorwayId, inventoryProductId: existing.id, status: "updated", colorCode });
    });
  });

  return {
    document: nextDocument,
    result: {
      styleCount: snapshot.styles.length,
      colorwayCount: snapshot.styles.reduce((sum, style) => sum + (style.colorways || []).length, 0),
      createdProducts,
      updatedProducts,
      blockedColorways,
      colorwayResults
    }
  };
}
