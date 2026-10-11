import { Router } from "express";
import { pool } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { parseId, toSpace, validateSpace } from "../spaces";

export const spacesRouter = Router();

// GET /spaces/:id — one space. Inactive spaces are visible to their owner only.
spacesRouter.get("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = id ? await pool.query("SELECT * FROM parking_spaces WHERE id = $1", [id]) : { rows: [] };
  const row = rows[0];
  if (!row || (!row.is_active && row.owner_id !== req.user!.id)) {
    return res.status(404).json({ error: "Parking space not found" });
  }
  res.json({ space: toSpace(row) });
});

// POST /spaces — an owner lists a new space.
spacesRouter.post("/", requireRole("owner"), async (req, res) => {
  const result = validateSpace(req.body ?? {});
  if ("error" in result) return res.status(400).json({ error: result.error });
  const s = result.space;

  const { rows } = await pool.query(
    `INSERT INTO parking_spaces
       (owner_id, name, address, lat, lng, space_type, ownership,
        total_slots, price_per_hour, open_time, close_time, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [req.user!.id, s.name, s.address, s.lat, s.lng, s.space_type, s.ownership,
     s.total_slots, s.price_per_hour, s.open_time, s.close_time, s.is_active]
  );
  res.status(201).json({ space: toSpace(rows[0]) });
});

// PATCH /spaces/:id — the space's owner changes some or all of its fields.
spacesRouter.patch("/:id", requireRole("owner"), async (req, res) => {
  const id = parseId(req.params.id);
  const found = id ? await pool.query("SELECT * FROM parking_spaces WHERE id = $1", [id]) : { rows: [] };
  const current = found.rows[0];
  if (!current) return res.status(404).json({ error: "Parking space not found" });
  if (current.owner_id !== req.user!.id) {
    return res.status(403).json({ error: "You can only edit your own spaces" });
  }

  // Apply the changes on top of the stored space, then validate the whole thing.
  const result = validateSpace({ ...toSpace(current), ...(req.body ?? {}) });
  if ("error" in result) return res.status(400).json({ error: result.error });
  const s = result.space;

  const { rows } = await pool.query(
    `UPDATE parking_spaces
     SET name = $2, address = $3, lat = $4, lng = $5, space_type = $6, ownership = $7,
         total_slots = $8, price_per_hour = $9, open_time = $10, close_time = $11, is_active = $12
     WHERE id = $1
     RETURNING *`,
    [id, s.name, s.address, s.lat, s.lng, s.space_type, s.ownership,
     s.total_slots, s.price_per_hour, s.open_time, s.close_time, s.is_active]
  );
  res.json({ space: toSpace(rows[0]) });
});
