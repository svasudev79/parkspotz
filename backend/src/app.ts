import express from "express";
import cookieParser from "cookie-parser";
import { pool } from "./db";
import { authRouter } from "./routes/auth";
import { bookingsRouter } from "./routes/bookings";
import { gateRouter } from "./routes/gate";
import { ownerRouter } from "./routes/owner";
import { spacesRouter } from "./routes/spaces";
import { verifyRouter } from "./routes/verify";
import { visitsRouter } from "./routes/visits";

// The browser never calls this API directly: the Next.js frontend forwards
// /api/* here, so there is no CORS setup and cookies stay first-party.
export const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "unreachable" });
  }
});

app.use("/auth", authRouter);
app.use("/owner", ownerRouter);
app.use("/spaces", spacesRouter);
app.use("/bookings", bookingsRouter);
app.use("/verify", verifyRouter);
app.use("/gate", gateRouter);
app.use("/visits", visitsRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Malformed JSON bodies and similar client errors carry a 4xx status.
  const status = (err as { status?: number }).status;
  if (status && status >= 400 && status < 500) {
    return res.status(status).json({ error: status === 413 ? "That file is too large" : "Invalid request" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});
