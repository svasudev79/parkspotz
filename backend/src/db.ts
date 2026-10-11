import { Pool } from "pg";
import { config } from "./config";

// One small pool for the whole process. DATABASE_URL is an ordinary Postgres
// connection string; add ?sslmode=require (or verify-full) for a hosted
// database. Nothing here needs a session of its own (no LISTEN, advisory
// locks or SET), so a pooled, transaction-mode endpoint works too.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: config.pgPoolMax,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 15_000,
});

// A hosted database may close idle connections (for example when it goes to
// sleep). Without a listener that would crash the process; the pool simply
// opens a new connection on the next query.
pool.on("error", (err) => console.error("Postgres connection dropped:", err.message));
