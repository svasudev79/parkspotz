import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";

export const ownerRouter = Router();

ownerRouter.use(requireRole("owner"));

// GET /owner/spaces — the logged-in owner's own parking spaces.
ownerRouter.get("/spaces", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM parking_spaces WHERE owner_id = $1 ORDER BY created_at DESC",
    [req.user!.id]
  );
  res.json({ spaces: rows });
});
