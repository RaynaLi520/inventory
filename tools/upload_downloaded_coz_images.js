const fs = require('fs');
const path = require('path');
const { Client } = require(process.env.TMP_PG + '\\node_modules\\pg');

const projectUrl = 'https://cnqjdgqjeufrnpkmdoyx.supabase.co';
const anonKey = 'sb_publishable_PYr1oSrlmUSD2umAQ3DwAA_KTFQfrBc';
const assetDir = process.env.COZ_ASSET_DIR;
const manifest = JSON.parse(fs.readFileSync(path.join(assetDir, 'manifest.json'), 'utf8'));
const sourceAssets = manifest.assets.filter((a) => a.url.includes('/Upload/') && fs.existsSync(a.path));
  const startedAt = Date.now();
const clean = (v) => String(v || '').trim();
const safe = (v) => clean(v).toUpperCase().replace(/[^A-Z0-9+_-]+/g, '-').replace(/^-+|-+$/g, '') || 'SKC';
const sourceKey = (v) => {
  try { return decodeURIComponent(clean(v)).split('/').pop().split('?')[0].toLowerCase(); }
  catch (_) { return clean(v).split('/').pop().split('?')[0].toLowerCase(); }
};
const mime = (file) => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file).toLowerCase()] || 'application/octet-stream');

async function main() {
  const client = new Client({ host: 'db.cnqjdgqjeufrnpkmdoyx.supabase.co', port: 5432, user: 'postgres', password: process.env.SB_DB_PASS, database: 'postgres', ssl: { rejectUnauthorized: false } });
  await client.connect();
  const result = await client.query("select data from public.inventory_platform_state where id='default'");
  if (!result.rows[0]) throw new Error('inventory state not found');
  const document = result.rows[0].data;
  const state = document.state || {};
  const products = Array.isArray(state.products) ? state.products : [];
  const sourceToProducts = new Map();
  for (const product of products) {
    const key = sourceKey(product.imageSourceName || product.imagePath);
    if (!key) continue;
    if (!sourceToProducts.has(key)) sourceToProducts.set(key, []);
    sourceToProducts.get(key).push(product);
  }
  const uploaded = [];
  const failed = [];
  for (const [assetIndex, asset] of sourceAssets.entries()) {
    const ext = path.extname(asset.path).toLowerCase() || '.jpg';
    const matches = sourceToProducts.get(sourceKey(asset.name)) || [];
    const product = matches[0];
    const skc = safe(product?.style || product?.sourceBaseSku || path.basename(asset.name, ext));
    const code = safe(product?.colorCode || document.colorMappings?.[product?.color] || 'COLOR');
    const stamp = new Date(startedAt + assetIndex * 1000).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const objectName = `${skc}-${code}_${stamp}${ext === '.jpeg' ? '.jpg' : ext}`;
    const body = fs.readFileSync(asset.path);
    const response = await fetch(`${projectUrl}/storage/v1/object/product-images/${encodeURIComponent(objectName)}`, {
      method: 'POST', headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, 'Content-Type': mime(asset.path), 'x-upsert': 'true' }, body
    });
    if (!response.ok) { failed.push({ source: asset.name, status: response.status, detail: await response.text() }); continue; }
    const publicUrl = `${projectUrl}/storage/v1/object/public/product-images/${encodeURIComponent(objectName)}`;
    for (const item of matches) {
      item.image = publicUrl;
      item.imageName = objectName;
      item.imageUpdatedAt = new Date().toISOString();
      item.imageSyncStatus = 'available';
    }
    uploaded.push({ source: asset.name, objectName, matchedProducts: matches.length, style: product?.style || product?.sourceBaseSku || skc, color: product?.color || '', imageUrl: publicUrl });
  }
  document.state.products = products;
  document.imageCatalog = Array.isArray(document.imageCatalog) ? document.imageCatalog : [];
  for (const row of document.imageCatalog) {
    const hit = uploaded.find((item) => sourceKey(item.source) === sourceKey(row.sourceName));
    if (hit) { row.imageName = hit.objectName; row.status = 'available'; row.imageUrl = `${projectUrl}/storage/v1/object/public/product-images/${encodeURIComponent(hit.objectName)}`; }
  }
  const existingCatalog = new Set(document.imageCatalog.map((row) => `${clean(row.style)}\0${clean(row.color)}\0${clean(row.sourceName)}`));
  for (const item of uploaded) {
    const key = `${clean(item.style)}\0${clean(item.color)}\0${clean(item.source)}`;
    if (!existingCatalog.has(key)) {
      document.imageCatalog.push({ style: item.style, color: item.color, sourceName: item.source, imageName: item.objectName, imageUrl: item.imageUrl, status: 'available' });
    }
  }
  await client.query("update public.inventory_platform_state set data=$1::jsonb, updated_at=now() where id='default'", [JSON.stringify(document)]);
  await client.end();
  console.log(JSON.stringify({ candidates: sourceAssets.length, uploaded, failed }, null, 2));
}
main().catch((error) => { console.error(error); process.exit(1); });
