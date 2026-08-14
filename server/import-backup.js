import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { Pool } from "pg";

const backupPath = process.argv[2];
const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "/var/lib/henan-inventory/media");
if (!backupPath) throw new Error("Usage: node server/import-backup.js <supabase-backup.json>");

const rows = JSON.parse(await readFile(backupPath, "utf8"));
const document = structuredClone(rows?.[0]?.data);
if (!Array.isArray(document?.state?.products) || !Array.isArray(document?.state?.bundles)) {
  throw new Error("Backup does not contain a valid inventory document");
}

await mkdir(mediaRoot, { recursive: true });
const downloaded = new Map();
let migrated = 0;
let failed = 0;

function safeFileName(value, fallback = "product.jpg") {
  const normalized = path.basename(String(value || fallback)).toUpperCase()
    .replace(/\.JPEG$/i, ".jpg")
    .replace(/[^A-Z0-9+_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /\.(?:JPG|PNG|WEBP)$/i.test(normalized) ? normalized : `${normalized || "PRODUCT"}.jpg`;
}

async function storeImage(source, requestedName) {
  if (!source || String(source).startsWith("/media/")) return source || "";
  if (downloaded.has(source)) return downloaded.get(source);
  try {
    let bytes;
    let mimeType = "image/jpeg";
    const dataMatch = String(source).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
    if (dataMatch) {
      mimeType = dataMatch[1];
      bytes = Buffer.from(dataMatch[2], "base64");
    } else {
      const response = await fetch(source, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      mimeType = response.headers.get("content-type") || mimeType;
      bytes = Buffer.from(await response.arrayBuffer());
    }
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error("invalid image size");
    const extension = mimeType.includes("png") ? "png" : mimeType.includes("webp") ? "webp" : "jpg";
    const baseName = safeFileName(requestedName).replace(/\.(?:JPG|PNG|WEBP)$/i, `.${extension}`);
    const finalPath = path.join(mediaRoot, baseName);
    await writeFile(finalPath, bytes, { mode: 0o640 });
    const localUrl = `/media/${encodeURIComponent(baseName)}`;
    downloaded.set(source, localUrl);
    migrated += 1;
    return localUrl;
  } catch (error) {
    failed += 1;
    console.warn(`Image migration failed: ${requestedName || source} (${error.message})`);
    return source;
  }
}

const imageJobs = [];
for (const entry of document.imageCatalog || []) {
  imageJobs.push(async () => { entry.imageUrl = await storeImage(entry.imageUrl, entry.imageName); });
}
for (const product of document.state.products) {
  imageJobs.push(async () => {
    product.image = await storeImage(product.image, product.imageName || `${product.baseSku || product.id}.jpg`);
  });
}

for (let index = 0; index < imageJobs.length; index += 6) {
  await Promise.all(imageJobs.slice(index, index + 6).map((job) => job()));
}

const pool = new Pool();
const client = await pool.connect();
try {
  await client.query("begin");
  await client.query(
    `insert into inventory_platform_state (id, data, updated_at)
     values ('default', $1::jsonb, now())
     on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at`,
    [JSON.stringify(document)]
  );
  await client.query(
    "insert into inventory_platform_state_history (state_id, data, source) values ('default', $1::jsonb, 'supabase-migration')",
    [JSON.stringify(document)]
  );
  await client.query("commit");
} catch (error) {
  await client.query("rollback");
  throw error;
} finally {
  client.release();
  await pool.end();
}

console.log(JSON.stringify({
  products: document.state.products.length,
  bundles: document.state.bundles.length,
  migratedImages: migrated,
  failedImages: failed,
  checksum: crypto.createHash("sha256").update(JSON.stringify(document)).digest("hex")
}));
