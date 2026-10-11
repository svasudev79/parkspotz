// Creates the platform admin login, or updates its password if it exists.
// This is the only way an admin account can come into being. It reads
// ADMIN_USERNAME and ADMIN_PASSWORD from the environment (backend/.env, or
// the command line for a remote database) and never prints the password.
import bcrypt from "bcryptjs";
import { config, setInShell } from "../config";
import { pool } from "../db";
import { confirmDatabaseTarget, databaseTarget, passwordProblem } from "../safety";
import { normalizeUsername } from "../validation";

async function main() {
  const username = normalizeUsername(process.env.ADMIN_USERNAME);
  const password = process.env.ADMIN_PASSWORD ?? "";
  if (!/^[a-z0-9_.]{3,30}$/.test(username)) throw new Error("Set ADMIN_USERNAME in backend/.env (3-30 letters, numbers, dot or underscore)");
  if (!password) throw new Error("Set ADMIN_PASSWORD in backend/.env");
  const problem = passwordProblem("ADMIN_PASSWORD", username, password);
  if (problem) throw new Error(problem);

  console.log(confirmDatabaseTarget(config.databaseUrl, process.env.CONFIRM_REMOTE, `Creating or updating admin "${username}" in`));
  // For a database on another machine the password must be given on the
  // command line, so a local backend/.env password is never reused by accident.
  if (!databaseTarget(config.databaseUrl).isLocal && !setInShell("ADMIN_PASSWORD")) {
    throw new Error("For a remote database, pass ADMIN_PASSWORD in the command's environment (not from backend/.env)");
  }

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
