import { Router } from "express";
import { overlappingBookingsSql, withinOpeningHoursSql } from "../availability";
import { config } from "../config";
import { pool } from "../db";
import { publicOr, requireRole } from "../middleware/auth";
import { parseId, toPublicSpace, toSpace, validateSpace } from "../spaces";

export const spacesRouter = Router();

const MAX_RADIUS_M = 50_000;
const EARTH_RADIUS_M = 6_371_000;

// Great-circle (Haversine) distance in metres from ($1 lat, $2 lng) to space `s`.
const DISTANCE_SQL = `(${EARTH_RADIUS_M} * 2 * asin(sqrt(
    power(sin(radians(s.lat - $1) / 2), 2) +
    cos(radians($1)) * cos(radians(s.lat)) * power(sin(radians(s.lng - $2) / 2), 2)
  )))`;

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Search and the space page are public: guests can use them without logging
// in. Attendants and the admin have no use for them and are refused.

// GET /spaces?lat&lng&radius&start&end — active spaces within `radius` metres,
// nearest first, with slots available for the window start..end (ISO times).
// Spaces closed for that window are still listed, with is_open = false.
spacesRouter.get("/", publicOr("customer", "owner"), async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius);
  const start = parseDate(req.query.start);
  const end = parseDate(req.query.end);

  if (req.query.lat === undefined || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).json({ error: "lat must be between -90 and 90" });
  }
  if (req.query.lng === undefined || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({ error: "lng must be between -180 and 180" });
  }
  if (!Number.isFinite(radius) || radius <= 0 || radius > MAX_RADIUS_M) {
    return res.status(400).json({ error: `radius must be between 1 and ${MAX_RADIUS_M} metres` });
  }
  if (!start || !end) return res.status(400).json({ error: "start and end must be valid date-times" });
  if (end <= start) return res.status(400).json({ error: "end must be after start" });

  const { rows } = await pool.query(
    `SELECT * FROM (
       SELECT s.*,
              ${DISTANCE_SQL} AS distance_m,
              GREATEST(s.total_slots - ${overlappingBookingsSql("s.id", "$4", "$5", "$6")}, 0) AS slots_available,
              ${withinOpeningHoursSql("$4", "$5")} AS is_open
       FROM parking_spaces s
       WHERE s.is_active
     ) nearby
     WHERE distance_m <= $3
     ORDER BY distance_m`,
    [lat, lng, radius, start.toISOString(), end.toISOString(), config.bookingHoldMinutes]
  );

  res.json({
    spaces: rows.map((row) => ({ ...toPublicSpace(row, req.user?.id), distance_m: Math.round(row.distance_m) })),
  });
});

// GET /spaces/:id — one space. Inactive spaces are visible to their owner only.
spacesRouter.get("/:id", publicOr("customer", "owner"), async (req, res) => {
  const id = parseId(req.params.id);
  const { rows } = id ? await pool.query("SELECT * FROM parking_spaces WHERE id = $1", [id]) : { rows: [] };
  const row = rows[0];
  if (!row || (!row.is_active && row.owner_id !== req.user?.id)) {
    return res.status(404).json({ error: "Parking space not found" });
  }
  res.json({ space: toPublicSpace(row, req.user?.id) });
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
