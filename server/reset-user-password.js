import { Pool } from "pg";
import { hashPassword } from "./auth.js";

const username = String(process.env.RESET_USERNAME || "").trim().toLowerCase();
const temporaryPassword = String(process.env.RESET_TEMPORARY_PASSWORD || "");

if (!/^[a-z0-9._-]{3,32}$/.test(username)) throw new Error("RESET_USERNAME is invalid");
if (temporaryPassword.length < 5 || temporaryPassword.length > 128) {
  throw new Error("RESET_TEMPORARY_PASSWORD must be 5-128 characters");
}

const pool = new Pool();
try {
  const passwordHash = await hashPassword(temporaryPassword);
  const result = await pool.query(
    `update app_users set password_hash = $2, must_change_password = true,
       failed_login_attempts = 0, locked_until = null, updated_at = now()
     where username = $1 returning id`,
    [username, passwordHash]
  );
  if (!result.rows[0]) throw new Error(`User ${username} does not exist`);
  await pool.query("delete from app_sessions where user_id = $1", [result.rows[0].id]);
  console.log(`Temporary password reset for ${username}.`);
} finally {
  await pool.end();
}
