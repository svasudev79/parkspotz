import { app } from "./app";
import { config } from "./config";
import { pool } from "./db";

const server = app.listen(config.port, () => console.log(`API listening on :${config.port}`));

// Cloud Run (and Ctrl+C) stop the process with a signal. Finish the requests
// in flight, close the database connections, then exit.
function shutDown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    pool.end().finally(() => process.exit(0));
  });
  // Do not hang for ever on a stuck connection.
  setTimeout(() => process.exit(1), 9_000).unref();
}
process.on("SIGTERM", () => shutDown("SIGTERM"));
process.on("SIGINT", () => shutDown("SIGINT"));
