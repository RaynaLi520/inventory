const fs = require('fs');
const path = require('path');

const capturePath = process.argv[2];
const root = path.resolve(__dirname, '..');
const configText = fs.readFileSync(path.join(root, 'assets', 'supabase-config.js'), 'utf8');
const projectUrl = configText.match(/url:\s*["']([^"']+)/)?.[1]?.replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || configText.match(/anonKey:\s*["']([^"']+)/)?.[1];
const sourceRoot = 'http://it.justinallen.com:8899/coz/Upload/';
const clean = (value) => String(value ?? '').replaceAll('\t', '').trim();
const key = (value) => clean(value).toLowerCase();
const safe = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9+_-]+/g, '-').replace(/^-+|-+$/g, '') || 'SKC';
const sourceKey = (value) => clean(value).toLowerCase();
const extension = (file) => {
  const ext = path.extname(file).toLowerCase();
  return ext === '.jpeg' ? '.jpg' : ['.jpg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
};
const mime = (ext) => ({ '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[ext]);
const timestamp = (offset) => new Date(Date.now() + offset * 1000).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const requestTimeoutMs = 30000;
const retryDelayMs = 1000;

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fetch(url, { ...options, signal: AbortSignal.timeout(requestTimeoutMs) });
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(retryDelayMs * attempt);
    }
  }
  throw lastError;
}

async function api(url, options = {}) {
  const response = await request(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!capturePath || !fs.existsSync(capturePath)) throw new Error('Usage: node tools/import_coz_image_capture.js <capture.json>');
  if (!projectUrl || !anonKey) throw new Error('Supabase config is missing');
  const capture = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
  const rows = capture.response?.table?.Data;
  if (capture.status !== 200 || !Array.isArray(rows) || capture.response.table.AllRowLoaded !== true) throw new Error('Capture is incomplete or invalid');
  console.log(`capture rows=${rows.length}; loading cloud inventory state`);
  const records = await api(`${projectUrl}/rest/v1/inventory_platform_state?id=eq.default&select=data`);
  if (!records?.[0]?.data) throw new Error('Cloud inventory state was not found');
  const document = records[0].data;
  const products = document.state?.products || [];
  const mappings = document.colorMappings || {};
  document.imageCatalog = Array.isArray(document.imageCatalog) ? document.imageCatalog : [];
  const catalogBySource = new Map(document.imageCatalog.map((item) => [sourceKey(item.sourceName), item]));
  const result = { totalRows: rows.length, sourceImages: 0, uploaded: 0, reused: 0, missingSource: 0, matchedProducts: 0, unmatched: [], failed: [] };

  for (const [index, row] of rows.entries()) {
    const style = clean(row.C0);
    const color = clean(row.C1);
    const sourceName = clean(row.C2);
    if (!style || !color || !sourceName) { result.missingSource += 1; continue; }
    console.log(`row=${index + 1}/${rows.length} style=${style} color=${color}`);
    result.sourceImages += 1;
    const matches = products.filter((product) => [product.style, product.sourceBaseSku, product.baseSku, product.originalStyle].map(key).includes(key(style)) && key(product.color) === key(color));
    const existing = catalogBySource.get(sourceKey(sourceName));
    let imageName = existing?.imageName || '';
    let imageUrl = existing?.imageUrl || '';
    if (existing?.status === 'available' && imageUrl) {
      result.reused += 1;
    } else {
      const ext = extension(sourceName);
      const colorCode = safe(matches[0]?.colorCode || mappings[color] || 'COLOR');
      imageName = `${safe(style)}-${colorCode}_${timestamp(index)}${ext}`;
      try {
        const sourceUrl = `${sourceRoot}${encodeURIComponent(sourceName)}?imageSize=2`;
        const sourceResponse = await request(sourceUrl);
        if (!sourceResponse.ok) throw new Error(`CoZ download ${sourceResponse.status}`);
        const bytes = await sourceResponse.arrayBuffer();
        await api(`${projectUrl}/storage/v1/object/product-images/${encodeURIComponent(imageName)}`, {
          method: 'POST', body: bytes, headers: { 'Content-Type': sourceResponse.headers.get('content-type') || mime(ext), 'x-upsert': 'true' }
        });
        imageUrl = `${projectUrl}/storage/v1/object/public/product-images/${encodeURIComponent(imageName)}`;
        result.uploaded += 1;
      } catch (error) {
        result.failed.push({ style, color, sourceName, reason: error.message });
        continue;
      }
    }
    for (const product of matches) {
      product.image = imageUrl;
      product.imageName = imageName;
      product.imageSourceName = sourceName;
      product.imageUpdatedAt = new Date().toISOString();
      product.imageSyncStatus = 'available';
      result.matchedProducts += 1;
    }
    if (!matches.length) result.unmatched.push({ style, color, sourceName, imageName, imageUrl });
    const catalogItem = { style, color, sourceName, imageName, imageUrl, status: 'available' };
    if (existing) Object.assign(existing, catalogItem);
    else { document.imageCatalog.push(catalogItem); catalogBySource.set(sourceKey(sourceName), catalogItem); }
    if ((index + 1) % 10 === 0 || index === rows.length - 1) console.log(`progress=${index + 1}/${rows.length} uploaded=${result.uploaded} reused=${result.reused} failed=${result.failed.length}`);
  }

  console.log('saving cloud inventory state');
  await api(`${projectUrl}/rest/v1/inventory_platform_state?id=eq.default`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ data: document, updated_at: new Date().toISOString() })
  });
  const reportPath = path.join(root, 'coz-image-import-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, unmatched: result.unmatched.length, failed: result.failed.length, reportPath }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); });
