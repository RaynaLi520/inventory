import express from "express";
import { Pool } from "pg";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const app = express();
const port = Number(process.env.PORT || 3000);
const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "/var/lib/henan-inventory/media");
const pool = new Pool();

app.disable("x-powered-by");
app.use(express.json({ limit: "18mb" }));
app.use((request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

function validInventoryDocument(document) {
  return Boolean(
    document
    && Array.isArray(document?.state?.products)
    && Array.isArray(document?.state?.movements)
    && Array.isArray(document?.state?.bundles)
  );
}

function imageFileName(value, mimeType) {
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const requested = path.basename(String(value || "")).toUpperCase()
    .replace(/\.JPEG$/i, ".jpg")
    .replace(/[^A-Z0-9+_.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const stem = requested.replace(/\.(?:JPG|PNG|WEBP)$/i, "") || "SKC";
  return `${stem}_${Date.now()}_${crypto.randomBytes(3).toString("hex")}.${extension}`;
}

app.get("/api/health", async (_request, response, next) => {
  try {
    const result = await pool.query("select now() as database_time");
    response.json({ status: "ok", databaseTime: result.rows[0].database_time });
  } catch (error) { next(error); }
});

app.get("/api/state", async (_request, response, next) => {
  try {
    const result = await pool.query("select data, updated_at from inventory_platform_state where id = 'default'");
    response.json(result.rows[0] || { data: null, updated_at: null });
  } catch (error) { next(error); }
});

app.put("/api/state", async (request, response, next) => {
  const document = request.body?.data;
  if (!validInventoryDocument(document)) {
    response.status(400).json({ error: "Invalid inventory document" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const previous = await client.query("select data from inventory_platform_state where id = 'default' for update");
    if (previous.rows[0]) {
      await client.query(
        "insert into inventory_platform_state_history (state_id, data, source) values ('default', $1::jsonb, 'web')",
        [JSON.stringify(previous.rows[0].data)]
      );
    }
    const result = await client.query(
      `insert into inventory_platform_state (id, data, updated_at)
       values ('default', $1::jsonb, now())
       on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at
       returning updated_at`,
      [JSON.stringify(document)]
    );
    await client.query(
      "delete from inventory_platform_state_history where revision_id not in (select revision_id from inventory_platform_state_history order by created_at desc limit 200)"
    );
    await client.query("commit");
    response.json({ updated_at: result.rows[0].updated_at });
  } catch (error) {
    await client.query("rollback");
    next(error);
  } finally {
    client.release();
  }
});

app.post("/api/images", async (request, response, next) => {
  try {
    const match = String(request.body?.dataUrl || "").match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) {
      response.status(400).json({ error: "Unsupported image payload" });
      return;
    }
    const bytes = Buffer.from(match[2], "base64");
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) {
      response.status(413).json({ error: "Image must be between 1 byte and 15 MB" });
      return;
    }
    await mkdir(mediaRoot, { recursive: true });
    const fileName = imageFileName(request.body?.fileName, match[1]);
    const finalPath = path.join(mediaRoot, fileName);
    const temporaryPath = `${finalPath}.tmp-${crypto.randomBytes(4).toString("hex")}`;
    await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o640 });
    await rename(temporaryPath, finalPath);
    response.status(201).json({ url: `/media/${encodeURIComponent(fileName)}`, fileName });
  } catch (error) { next(error); }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  response.status(500).json({ error: "Inventory server request failed" });
});

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`Inventory API listening on 127.0.0.1:${port}`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
