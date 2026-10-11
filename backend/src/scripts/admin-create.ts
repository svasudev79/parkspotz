// Creates the platform admin login, or updates its password if it exists.
// This is the only way an admin account can come into being. It reads
// ADMIN_USERNAME and ADMIN_PASSWORD from the environment (backend/.env) and
// never prints the password.
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { normalizeUsername } from "../validation";

const WEAK = ["password", "admin", "parkspotz", "changeme", "change-me", "123456", "qwerty", "letmein"];

function checkPassword(username: string, password: string): string | null {
  if (password.length < 12) return "ADMIN_PASSWORD must be at least 12 characters";
  if (Buffer.byteLength(password, "utf8") > 72) return "ADMIN_PASSWORD must be at most 72 characters";
  const lower = password.toLowerCase();
  if (lower.includes(username) || WEAK.some((word) => lower.includes(word))) {
    return "ADMIN_PASSWORD is too easy to guess; use a long random value";
  }
  if (new Set(password).size < 6) return "ADMIN_PASSWORD is too repetitive; use a long random value";
  return null;
}

async function main() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME);
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) throw new Error("Set ADMIN_USERNAME in backend/.env (3-30 letters, numbers, dot or underscore)");
  if (!password) throw new Error("Set ADMIN_PASSWORD in backend/.env");
  const problem = checkPassword(username, password);
  if (problem) throw new Error(problem);

  const existing = (await pool.query("SELECT id, role FROM users WHERE username = $1", [username])).rows[0];
  if (existing && existing.role !== "admin") {
    throw new Error(`The username "${username}" already belongs to a ${existing.role} account; choose another ADMIN_USERNAME`);
  }

  const hash = await bcrypt.hash(password, 12);
  if (existing) {
    await pool.query("UPDATE users SET password_hash = $2, is_active = true WHERE id = $1", [existing.id, hash]);
    console.log(`Admin "${username}" already existed; its password was updated.`);
  } else {
    await pool.query("INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'admin')", [username, hash]);
    console.log(`Admin "${username}" was created.`);
  }
}

main()
  .catch((err) => {
    console.error("Could not create the admin:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
