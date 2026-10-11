import { Pool } from "pg";
import { config } from "./config";

export const pool = new Pool({
  connectionString: config.databaseUrl,
  // Cloud Run connects to Cloud SQL over a Unix socket at this path when
  // INSTANCE_CONNECTION_NAME is set; DATABASE_URL should point at it in prod.
  ...(process.env.INSTANCE_CONNECTION_NAME
    ? { host: `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}` }
    : {}),
});
