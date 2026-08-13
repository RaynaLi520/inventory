/*
  Batch-import locally saved CoZ images.

  CSV columns (UTF-8): style,color,file
  Example: JA25GJK514,米色,JA25GJK514_BG.jpg

  Environment:
    SUPABASE_URL=https://...supabase.co
    SUPABASE_ANON_KEY=...
*/
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const configText = fs.readFileSync(path.join(root, 'assets', 'supabase-config.js'), 'utf8');
const projectUrl = (process.env.SUPABASE_URL || configText.match(/url:\s*["']([^"']+)/)?.[1] || '').replace(/\/$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || configText.match(/anonKey:\s*["']([^"']+)/)?.[1] || '';
const [imageDirArg, csvArg] = process.argv.slice(2);
const imageDir = path.resolve(imageDirArg || 'coz-images');
const csvPath = path.resolve(csvArg || path.join(imageDir, 'mapping.csv'));
const headers = { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
const clean = (value) => String(value ?? '').replace(/^\uFEFF/, '').trim();
const key = (value) => clean(value).toLowerCase();
const safe = (value) => clean(value).toUpperCase().replace(/[^A-Z0-9+_-]+/g, '-').replace(/^-+|-+$/g, '') || 'SKC';
const mime = (file) => ({ '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' }[path.extname(file).toLowerCase()] || '');
const stamp = (offset) => new Date(Date.now() + offset * 1000).toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function parseCsv(raw) {
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error('mapping.csv must contain a header and at least one row');
  const parseLine = (line) => {
    const cells = [];
    let cell = '', quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = !quoted;
      else if (char === ',' && !quoted) { cells.push(cell); cell = ''; }
      else cell += char;
    }
    cells.push(cell);
    return cells.map(clean);
  };
  const header = parseLine(lines[0]).map(key);
  const styleIndex = header.indexOf('style');
  const colorIndex = header.indexOf('color');
  const fileIndex = header.indexOf('file');
  if (styleIndex < 0 || colorIndex < 0 || fileIndex < 0) throw new Error('mapping.csv header must be: style,color,file');
  return lines.slice(1).map((line, index) => {
    const values = parseLine(line);
    return { line: index + 2, style: values[styleIndex], color: values[colorIndex], file: values[fileIndex] };
  }).filter((row) => row.style && row.color && row.file);
}

async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 240)}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!projectUrl || !anonKey) throw new Error('Supabase config is missing');
  if (!fs.existsSync(imageDir) || !fs.existsSync(csvPath)) throw new Error(`Missing image folder or mapping CSV: ${imageDir}`);
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  const records = await api(`${projectUrl}/rest/v1/inventory_platform_state?id=eq.default&select=data`);
  if (!records[0]?.data) throw new Error('Cloud inventory state was not found');
  const document = records[0].data;
  const products = document.state?.products || [];
  const mappings = document.colorMappings || {};
  const results = { uploaded: [], skipped: [], failed: [] };
  for (const [index, row] of rows.entries()) {
    const fullPath = path.resolve(imageDir, row.file);
    const type = mime(fullPath);
    if (!fs.existsSync(fullPath) || !type) { results.failed.push({ ...row, reason: 'file not found or unsupported image type' }); continue; }
    const matches = products.filter((product) => {
      const styles = [product.style, product.sourceBaseSku, product.baseSku, product.originalStyle].map(key);
      return styles.includes(key(row.style)) && key(product.color) === key(row.color);
    });
    if (!matches.length) { results.skipped.push({ ...row, reason: 'no matching style + color' }); continue; }
    const code = safe(matches[0].colorCode || mappings[row.color] || 'COLOR');
    const ext = path.extname(fullPath).toLowerCase() === '.jpeg' ? '.jpg' : path.extname(fullPath).toLowerCase();
    const objectName = `${safe(row.style)}-${code}_${stamp(index)}${ext}`;
    try {
      await api(`${projectUrl}/storage/v1/object/product-images/${encodeURIComponent(objectName)}`, {
        method: 'POST', body: fs.readFileSync(fullPath), headers: { 'Content-Type': type, 'x-upsert': 'true' }
      });
      const imageUrl = `${projectUrl}/storage/v1/object/public/product-images/${encodeURIComponent(objectName)}`;
      matches.forEach((product) => { product.image = imageUrl; product.imageName = objectName; product.imageUpdatedAt = new Date().toISOString(); product.imageSyncStatus = 'available'; });
      document.imageCatalog = Array.isArray(document.imageCatalog) ? document.imageCatalog : [];
      document.imageCatalog.push({ style: row.style, color: row.color, sourceName: row.file, imageName: objectName, imageUrl, status: 'available' });
      results.uploaded.push({ ...row, objectName, matchedProducts: matches.length });
    } catch (error) { results.failed.push({ ...row, reason: error.message }); }
  }
  await api(`${projectUrl}/rest/v1/inventory_platform_state?id=eq.default`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ data: document, updated_at: new Date().toISOString() }) });
  console.log(JSON.stringify(results, null, 2));
}
main().catch((error) => { console.error(error.message); process.exit(1); });
