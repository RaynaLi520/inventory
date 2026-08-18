import express from "express";
import { Pool } from "pg";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { createAuthService } from "./auth.js";

const app = express();
const port = Number(process.env.PORT || 3000);
const mediaRoot = path.resolve(process.env.MEDIA_ROOT || "/var/lib/henan-inventory/media");
const pool = new Pool();
const auth = createAuthService(pool);
const authRequired = process.env.AUTH_REQUIRED !== "false";
const directAccessUser = Object.freeze({
  id: "direct-access",
  username: "direct-access",
  email: "",
  displayName: "内网用户",
  role: "direct_access",
  roleLabel: "直接访问",
  status: "active",
  mustChangePassword: false,
  permissions: { manageUsers: false, manageMovements: true, manageCatalog: true }
});

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

function normalizedNumberMap(value) {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, quantity]) => [key, Number(quantity || 0)]));
}

function productStockFields(product) {
  return {
    sizes: normalizedNumberMap(product?.sizes),
    localSizes: normalizedNumberMap(product?.localSizes),
    warehouse: Number(product?.warehouse || 0),
    store: Number(product?.store || 0),
    reserved: Number(product?.reserved || 0),
    reservedBySize: normalizedNumberMap(product?.reservedBySize),
    locationStock: normalizedNumberMap(product?.locationStock)
  };
}

function bundleStockFields(bundle) {
  return {
    fixedStock: Number(bundle?.fixedStock || 0),
    fixedStockBySize: normalizedNumberMap(bundle?.fixedStockBySize),
    fixedWarehouse: Number(bundle?.fixedWarehouse || 0),
    fixedStore: Number(bundle?.fixedStore || 0),
    locationStock: normalizedNumberMap(bundle?.locationStock)
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function changesProtectedInventory(previousDocument, nextDocument) {
  if (!sameJson(previousDocument?.state?.movements || [], nextDocument?.state?.movements || [])) return true;
  if (!sameJson(previousDocument?.stockLocations || [], nextDocument?.stockLocations || [])) return true;

  const previousProducts = new Map((previousDocument?.state?.products || []).map((product) => [String(product.id), product]));
  for (const product of nextDocument?.state?.products || []) {
    const previous = previousProducts.get(String(product.id));
    if (previous && !sameJson(productStockFields(previous), productStockFields(product))) return true;
  }

  const previousBundles = new Map((previousDocument?.state?.bundles || []).map((bundle) => [String(bundle.id), bundle]));
  for (const bundle of nextDocument?.state?.bundles || []) {
    const previous = previousBundles.get(String(bundle.id));
    if (previous && !sameJson(bundleStockFields(previous), bundleStockFields(bundle))) return true;
  }
  return false;
}

function catalogProjection(document) {
  const projected = JSON.parse(JSON.stringify(document || {}));
  delete projected.stockLocations;
  delete projected.stockHistory;
  if (projected.state) {
    delete projected.state.movements;
    projected.state.products = (projected.state.products || []).map((product) => {
      const copy = { ...product };
      ["sizes", "localSizes", "warehouse", "store", "reserved", "reservedBySize", "reservedReported", "locationStock"].forEach((key) => delete copy[key]);
      return copy;
    });
    projected.state.bundles = (projected.state.bundles || []).map((bundle) => {
      const copy = { ...bundle };
      ["fixedStock", "fixedStockBySize", "fixedWarehouse", "fixedStore", "locationStock"].forEach((key) => delete copy[key]);
      return copy;
    });
  }
  return projected;
}

function changesCatalog(previousDocument, nextDocument) {
  return !sameJson(catalogProjection(previousDocument), catalogProjection(nextDocument));
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

function requireInventoryAccess(request, response, next) {
  if (authRequired) {
    auth.requireAuth(request, response, next);
    return;
  }
  request.auth = directAccessUser;
  next();
}

function requireInventoryPermission(permission) {
  if (authRequired) return auth.requirePermission(permission);
  return [requireInventoryAccess, (request, response, next) => {
    if (!request.auth.permissions?.[permission]) {
      response.status(403).json({ error: "当前访问模式没有此操作权限", code: "PERMISSION_DENIED" });
      return;
    }
    next();
  }];
}

app.get("/api/health", async (_request, response, next) => {
  try {
    const result = await pool.query("select now() as database_time");
    response.json({ status: "ok", databaseTime: result.rows[0].database_time });
  } catch (error) { next(error); }
});

app.use("/api/auth", auth.router);

app.get("/api/state", requireInventoryAccess, async (_request, response, next) => {
  try {
    const result = await pool.query("select data, updated_at from inventory_platform_state where id = 'default'");
    response.json(result.rows[0] || { data: null, updated_at: null });
  } catch (error) { next(error); }
});

app.put("/api/state", requireInventoryAccess, async (request, response, next) => {
  const document = request.body?.data;
  if (!validInventoryDocument(document)) {
    response.status(400).json({ error: "Invalid inventory document" });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("begin");
    const previous = await client.query("select data from inventory_platform_state where id = 'default' for update");
    const permissions = request.auth.permissions || {};
    if (!permissions.manageCatalog && !permissions.manageMovements) {
      await client.query("rollback");
      response.status(403).json({ error: "当前账号只有查看权限", code: "PERMISSION_DENIED" });
      return;
    }
    if (previous.rows[0]) {
      if (!permissions.manageMovements && changesProtectedInventory(previous.rows[0].data, document)) {
        await client.query("rollback");
        response.status(403).json({ error: "当前账号没有库存操作权限", code: "PERMISSION_DENIED" });
        return;
      }
      if (!permissions.manageCatalog && changesCatalog(previous.rows[0].data, document)) {
        await client.query("rollback");
        response.status(403).json({ error: "当前账号没有商品资料编辑权限", code: "PERMISSION_DENIED" });
        return;
      }
    }
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

app.post("/api/images", ...requireInventoryPermission("manageCatalog"), async (request, response, next) => {
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
