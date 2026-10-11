// Applies schema.sql to the database in DATABASE_URL. Safe to run repeatedly.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../db";

async function main() {
  const sql = readFileSync(join(process.cwd(), "schema.sql"), "utf8");
  await pool.query(sql);
  const { rows } = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  console.log(`Schema applied. Tables: ${rows.map((r) => r.table_name).join(", ")}`);
}

main()
  .catch((err) => {
    console.error("Schema setup failed:", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
