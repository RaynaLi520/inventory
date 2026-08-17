import { Pool } from "pg";
import { hashPassword, validPassword } from "./auth.js";

const username = String(process.env.INITIAL_ADMIN_USERNAME || "rayna.li").trim().toLowerCase();
const email = String(process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
const displayName = String(process.env.INITIAL_ADMIN_DISPLAY_NAME || "Rayna Li").trim();
const password = String(process.env.INITIAL_ADMIN_PASSWORD || "");

if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("INITIAL_ADMIN_USERNAME is invalid");
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("INITIAL_ADMIN_EMAIL is required");
if (!validPassword(password)) throw new Error("INITIAL_ADMIN_PASSWORD must be 10-128 characters and contain letters and numbers");

const pool = new Pool();
try {
  const passwordHash = await hashPassword(password);
  const result = await pool.query(
    `insert into app_users (username, email, display_name, password_hash, role, status, must_change_password, approved_at)
     values ($1, $2, $3, $4, 'admin', 'active', true, now())
     on conflict (username) do update set email = excluded.email, display_name = excluded.display_name,
       password_hash = excluded.password_hash, role = 'admin', status = 'active', must_change_password = true,
       failed_login_attempts = 0, locked_until = null, approved_at = coalesce(app_users.approved_at, now()), updated_at = now()
     returning username`,
    [username, email, displayName, passwordHash]
  );
  console.log(`Administrator ${result.rows[0].username} is ready.`);
} finally {
  await pool.end();
}
