import crypto from "node:crypto";
import { promisify } from "node:util";
import express from "express";

const scryptAsync = promisify(crypto.scrypt);
const SESSION_COOKIE = "ja_inventory_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_MIN_LENGTH = 10;
const ROLE_PERMISSIONS = {
  admin: { manageUsers: true, manageMovements: true, manageCatalog: true },
  inventory_manager: { manageUsers: false, manageMovements: true, manageCatalog: false },
  product_editor: { manageUsers: false, manageMovements: false, manageCatalog: true },
  viewer: { manageUsers: false, manageMovements: false, manageCatalog: false }
};
const ROLE_LABELS = {
  admin: "管理员",
  inventory_manager: "库存管理员",
  product_editor: "商品编辑",
  viewer: "只读人员"
};

function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part, ""] : [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
  }));
}

function tokenHash(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function normalizeUsername(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeEmail(value) {
  return normalizeUsername(value);
}

function validPassword(value) {
  const password = String(value || "");
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= 128 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scryptAsync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

async function verifyPassword(password, encoded) {
  const [algorithm, n, r, p, saltValue, keyValue] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !saltValue || !keyValue) return false;
  const expected = Buffer.from(keyValue, "base64url");
  const actual = await scryptAsync(String(password), Buffer.from(saltValue, "base64url"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p)
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicUser(row) {
  const role = row.role || "viewer";
  return {
    id: String(row.id),
    username: row.username,
    email: row.email,
    displayName: row.display_name,
    role,
    roleLabel: ROLE_LABELS[role] || ROLE_LABELS.viewer,
    status: row.status,
    mustChangePassword: Boolean(row.must_change_password),
    permissions: { ...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer) }
  };
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS * 1000
  };
}

function clientIp(request) {
  return String(request.get("X-Real-IP") || request.ip || "").slice(0, 80);
}

async function audit(pool, request, action, targetUserId = null, details = {}) {
  await pool.query(
    `insert into auth_audit_log (actor_user_id, target_user_id, action, details, ip_address)
     values ($1, $2, $3, $4::jsonb, $5)`,
    [request.auth?.id || null, targetUserId, action, JSON.stringify(details), clientIp(request)]
  );
}

function makeRateLimiter({ windowMs, limit }) {
  const attempts = new Map();
  return (request, response, next) => {
    const key = clientIp(request);
    const now = Date.now();
    const recent = (attempts.get(key) || []).filter((time) => now - time < windowMs);
    recent.push(now);
    attempts.set(key, recent);
    if (recent.length > limit) {
      response.status(429).json({ error: "请求过于频繁，请稍后再试", code: "RATE_LIMITED" });
      return;
    }
    next();
  };
}

export function createAuthService(pool) {
  const router = express.Router();
  const authLimiter = makeRateLimiter({ windowMs: 15 * 60 * 1000, limit: 30 });

  pool.query("delete from app_sessions where expires_at <= now()").catch(() => {});

  async function loadAuthenticatedUser(request) {
    const token = parseCookies(request.get("Cookie"))[SESSION_COOKIE];
    if (!token) return null;
    const result = await pool.query(
      `select u.*, s.token_hash, s.expires_at
       from app_sessions s
       join app_users u on u.id = s.user_id
       where s.token_hash = $1 and s.expires_at > now() and u.status = 'active'`,
      [tokenHash(token)]
    );
    if (!result.rows[0]) return null;
    pool.query("update app_sessions set last_seen_at = now() where token_hash = $1 and last_seen_at < now() - interval '10 minutes'", [tokenHash(token)]).catch(() => {});
    return publicUser(result.rows[0]);
  }

  async function optionalAuth(request, _response, next) {
    try {
      request.auth = await loadAuthenticatedUser(request);
      next();
    } catch (error) { next(error); }
  }

  async function requireAuth(request, response, next) {
    try {
      request.auth ||= await loadAuthenticatedUser(request);
      if (!request.auth) {
        response.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
        return;
      }
      if (request.auth.mustChangePassword) {
        response.status(403).json({ error: "首次登录需要修改密码", code: "PASSWORD_CHANGE_REQUIRED" });
        return;
      }
      next();
    } catch (error) { next(error); }
  }

  function requirePermission(permission) {
    return [requireAuth, (request, response, next) => {
      if (!request.auth.permissions?.[permission]) {
        response.status(403).json({ error: "当前账号没有此操作权限", code: "PERMISSION_DENIED" });
        return;
      }
      next();
    }];
  }

  async function createSession(response, user, request) {
    const token = crypto.randomBytes(32).toString("base64url");
    await pool.query(
      `insert into app_sessions (token_hash, user_id, expires_at, ip_address, user_agent)
       values ($1, $2, now() + interval '7 days', $3, $4)`,
      [tokenHash(token), user.id, clientIp(request), String(request.get("User-Agent") || "").slice(0, 300)]
    );
    response.cookie(SESSION_COOKIE, token, cookieOptions());
  }

  router.post("/register", authLimiter, async (request, response, next) => {
    try {
      const username = normalizeUsername(request.body?.username);
      const email = normalizeEmail(request.body?.email);
      const displayName = String(request.body?.displayName || "").trim();
      const password = String(request.body?.password || "");
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        response.status(400).json({ error: "用户名需为 3 至 32 位英文、数字、点、横线或下划线", field: "username" });
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) {
        response.status(400).json({ error: "请输入有效的工作邮箱", field: "email" });
        return;
      }
      if (displayName.length < 2 || displayName.length > 60) {
        response.status(400).json({ error: "姓名需为 2 至 60 个字符", field: "displayName" });
        return;
      }
      if (!validPassword(password)) {
        response.status(400).json({ error: `密码至少 ${PASSWORD_MIN_LENGTH} 位，并同时包含字母和数字`, field: "password" });
        return;
      }
      const passwordHash = await hashPassword(password);
      const result = await pool.query(
        `insert into app_users (username, email, display_name, password_hash, role, status)
         values ($1, $2, $3, $4, 'viewer', 'pending')
         on conflict do nothing returning id`,
        [username, email, displayName, passwordHash]
      );
      if (!result.rows[0]) {
        response.status(409).json({ error: "用户名或邮箱已被使用" });
        return;
      }
      await audit(pool, request, "user_registered", result.rows[0].id, { username, email });
      response.status(201).json({ message: "注册申请已提交，请等待管理员批准" });
    } catch (error) { next(error); }
  });

  router.post("/login", authLimiter, async (request, response, next) => {
    const identifier = normalizeUsername(request.body?.identifier);
    const password = String(request.body?.password || "");
    const client = await pool.connect();
    try {
      await client.query("begin");
      const result = await client.query(
        "select * from app_users where username = $1 or email = $1 for update",
        [identifier]
      );
      const user = result.rows[0];
      const matches = user ? await verifyPassword(password, user.password_hash) : false;
      if (!user || !matches) {
        if (user) {
          const failures = Number(user.failed_login_attempts || 0) + 1;
          await client.query(
            `update app_users set failed_login_attempts = $2,
             locked_until = case when $2 >= 5 then now() + interval '15 minutes' else locked_until end,
             updated_at = now() where id = $1`,
            [user.id, failures]
          );
        }
        await client.query("commit");
        response.status(401).json({ error: "账号或密码不正确", code: "INVALID_CREDENTIALS" });
        return;
      }
      if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
        await client.query("commit");
        response.status(423).json({ error: "登录失败次数过多，请 15 分钟后再试", code: "ACCOUNT_LOCKED" });
        return;
      }
      if (user.status === "pending") {
        await client.query("commit");
        response.status(403).json({ error: "注册申请仍在等待管理员批准", code: "ACCOUNT_PENDING" });
        return;
      }
      if (user.status !== "active") {
        await client.query("commit");
        response.status(403).json({ error: "账号已被停用，请联系管理员", code: "ACCOUNT_DISABLED" });
        return;
      }
      await client.query("update app_users set failed_login_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = $1", [user.id]);
      await client.query("commit");
      const payload = publicUser(user);
      await createSession(response, payload, request);
      request.auth = payload;
      await audit(pool, request, "user_logged_in", user.id);
      response.json({ user: payload });
    } catch (error) {
      await client.query("rollback");
      next(error);
    } finally { client.release(); }
  });

  router.post("/logout", optionalAuth, async (request, response, next) => {
    try {
      const token = parseCookies(request.get("Cookie"))[SESSION_COOKIE];
      if (token) await pool.query("delete from app_sessions where token_hash = $1", [tokenHash(token)]);
      if (request.auth) await audit(pool, request, "user_logged_out", request.auth.id);
      response.clearCookie(SESSION_COOKIE, { ...cookieOptions(), maxAge: undefined });
      response.status(204).end();
    } catch (error) { next(error); }
  });

  router.get("/session", optionalAuth, (request, response) => {
    if (!request.auth) {
      response.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
      return;
    }
    response.json({ user: request.auth });
  });

  router.get("/check", requireAuth, (_request, response) => {
    response.status(204).end();
  });

  router.post("/change-password", optionalAuth, async (request, response, next) => {
    try {
      if (!request.auth) {
        response.status(401).json({ error: "请先登录", code: "AUTH_REQUIRED" });
        return;
      }
      const currentPassword = String(request.body?.currentPassword || "");
      const newPassword = String(request.body?.newPassword || "");
      if (!validPassword(newPassword)) {
        response.status(400).json({ error: `新密码至少 ${PASSWORD_MIN_LENGTH} 位，并同时包含字母和数字` });
        return;
      }
      const result = await pool.query("select password_hash from app_users where id = $1", [request.auth.id]);
      if (!await verifyPassword(currentPassword, result.rows[0]?.password_hash)) {
        response.status(400).json({ error: "当前密码不正确" });
        return;
      }
      const passwordHash = await hashPassword(newPassword);
      await pool.query("update app_users set password_hash = $2, must_change_password = false, failed_login_attempts = 0, locked_until = null, updated_at = now() where id = $1", [request.auth.id, passwordHash]);
      await pool.query("delete from app_sessions where user_id = $1 and token_hash <> $2", [request.auth.id, tokenHash(parseCookies(request.get("Cookie"))[SESSION_COOKIE] || "")]);
      await audit(pool, request, "password_changed", request.auth.id);
      response.json({ message: "密码已修改" });
    } catch (error) { next(error); }
  });

  router.post("/request-password-reset", authLimiter, async (request, response, next) => {
    try {
      const identifier = normalizeUsername(request.body?.identifier);
      const user = (await pool.query("select id from app_users where username = $1 or email = $1", [identifier])).rows[0];
      if (user) {
        await pool.query(
          `insert into password_reset_requests (user_id, status)
           select $1, 'pending' where not exists (
             select 1 from password_reset_requests where user_id = $1 and status = 'pending'
           )`,
          [user.id]
        );
        await audit(pool, request, "password_reset_requested", user.id);
      }
      response.json({ message: "申请已提交。管理员确认后会提供一次性临时密码" });
    } catch (error) { next(error); }
  });

  router.get("/admin/users", ...requirePermission("manageUsers"), async (request, response, next) => {
    try {
      const result = await pool.query(
        `select u.id, u.username, u.email, u.display_name, u.role, u.status, u.must_change_password,
                u.created_at, u.last_login_at, count(r.id) filter (where r.status = 'pending')::int as reset_requests
         from app_users u left join password_reset_requests r on r.user_id = u.id
         group by u.id order by (u.status = 'pending') desc, u.created_at desc`
      );
      response.json({ users: result.rows.map((row) => ({ ...publicUser(row), createdAt: row.created_at, lastLoginAt: row.last_login_at, resetRequests: row.reset_requests })) });
    } catch (error) { next(error); }
  });

  router.patch("/admin/users/:id", ...requirePermission("manageUsers"), async (request, response, next) => {
    try {
      const id = String(request.params.id);
      const role = String(request.body?.role || "");
      const status = String(request.body?.status || "");
      if (!ROLE_PERMISSIONS[role] || !["pending", "active", "disabled"].includes(status)) {
        response.status(400).json({ error: "账号角色或状态无效" });
        return;
      }
      if (id === request.auth.id && (role !== "admin" || status !== "active")) {
        response.status(400).json({ error: "管理员不能停用自己或移除自己的管理员权限" });
        return;
      }
      const result = await pool.query(
        `update app_users set role = $2, status = $3, approved_by = case when $3 = 'active' then $4 else approved_by end,
         approved_at = case when $3 = 'active' and approved_at is null then now() else approved_at end, updated_at = now()
         where id = $1 returning *`,
        [id, role, status, request.auth.id]
      );
      if (!result.rows[0]) {
        response.status(404).json({ error: "账号不存在" });
        return;
      }
      if (status !== "active") await pool.query("delete from app_sessions where user_id = $1", [id]);
      await audit(pool, request, "admin_user_updated", id, { role, status });
      response.json({ user: publicUser(result.rows[0]) });
    } catch (error) { next(error); }
  });

  router.post("/admin/users/:id/reset-password", ...requirePermission("manageUsers"), async (request, response, next) => {
    try {
      const id = String(request.params.id);
      const temporaryPassword = `JA-${crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "A").slice(0, 8)}-${crypto.randomInt(100, 999)}`;
      const passwordHash = await hashPassword(temporaryPassword);
      const result = await pool.query(
        "update app_users set password_hash = $2, must_change_password = true, failed_login_attempts = 0, locked_until = null, updated_at = now() where id = $1 returning username",
        [id, passwordHash]
      );
      if (!result.rows[0]) {
        response.status(404).json({ error: "账号不存在" });
        return;
      }
      await pool.query("delete from app_sessions where user_id = $1", [id]);
      await pool.query("update password_reset_requests set status = 'completed', resolved_by = $2, resolved_at = now() where user_id = $1 and status = 'pending'", [id, request.auth.id]);
      await audit(pool, request, "admin_password_reset", id);
      response.json({ username: result.rows[0].username, temporaryPassword });
    } catch (error) { next(error); }
  });

  return { router, optionalAuth, requireAuth, requirePermission, loadAuthenticatedUser };
}

export { ROLE_LABELS, ROLE_PERMISSIONS, normalizeUsername, validPassword };
