import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";
import { parseId, toSpace } from "../spaces";

export const ownerRouter = Router();

ownerRouter.use(requireRole("owner"));

const PERIODS = ["day", "week", "month"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A "YYYY-MM-DD" query value, or null for "today in IST". undefined = invalid.
function parseDay(value: unknown): string | null | undefined {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return undefined;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? undefined : value;
}

// SQL for the IST calendar day in parameter `p` (today when it is null), as a
// timestamp without time zone at midnight.
const dayStartSql = (p: string) =>
  `date_trunc('day', COALESCE(${p}::date::timestamp, now() AT TIME ZONE 'Asia/Kolkata'))`;

// GET /owner/spaces — the logged-in owner's own parking spaces.
ownerRouter.get("/spaces", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM parking_spaces WHERE owner_id = $1 ORDER BY created_at DESC",
    [req.user!.id]
  );
  res.json({ spaces: rows.map(toSpace) });
});

// GET /owner/bookings?date=YYYY-MM-DD — confirmed bookings at the owner's
// spaces that start on that IST day (today when no date is given).
ownerRouter.get("/bookings", async (req, res) => {
  const day = parseDay(req.query.date);
  if (day === undefined) return res.status(400).json({ error: "date must look like 2026-01-31" });

  const { rows } = await pool.query(
    `SELECT b.id, b.start_time, b.end_time, b.amount, s.name AS space_name, u.username AS customer
     FROM bookings b
     JOIN parking_spaces s ON s.id = b.space_id
     JOIN users u ON u.id = b.user_id
     WHERE s.owner_id = $1 AND b.status = 'confirmed'
       AND b.start_time >= ${dayStartSql("$2")} AT TIME ZONE 'Asia/Kolkata'
       AND b.start_time < (${dayStartSql("$2")} + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
     ORDER BY b.start_time, b.id`,
    [req.user!.id, day]
  );
  res.json({
    bookings: rows.map(({ id, amount, ...rest }) => ({
      ...rest,
      id,
      amount: Number(amount),
      reference: `PSZ-${String(id).padStart(6, "0")}`,
    })),
  });
});

// GET /owner/stats?period=day|week|month&spaceId&date=YYYY-MM-DD
// Confirmed bookings, hours booked and revenue per space, plus a total.
// A booking counts in the period its start time falls in. Periods are IST
// calendar periods containing `date` (default today); weeks start on Monday.
ownerRouter.get("/stats", async (req, res) => {
  const period = req.query.period === undefined ? "day" : String(req.query.period);
  if (!PERIODS.includes(period)) return res.status(400).json({ error: "period must be day, week or month" });
  const day = parseDay(req.query.date);
  if (day === undefined) return res.status(400).json({ error: "date must look like 2026-01-31" });

  let spaceId: number | null = null;
  if (req.query.spaceId !== undefined && req.query.spaceId !== "") {
    spaceId = parseId(req.query.spaceId);
    const owned = spaceId
      ? await pool.query("SELECT 1 FROM parking_spaces WHERE id = $1 AND owner_id = $2", [spaceId, req.user!.id])
      : { rows: [] };
    // Another owner's space looks exactly like one that does not exist.
    if (owned.rows.length === 0) return res.status(404).json({ error: "Parking space not found" });
  }

  const { rows } = await pool.query(
    `WITH bounds AS (
       SELECT date_trunc($3, ${dayStartSql("$4")}) AS from_local
     )
     SELECT s.id AS space_id, s.name AS space_name,
            count(b.id)::int AS bookings,
            COALESCE(sum(extract(epoch FROM b.end_time - b.start_time)) / 3600, 0)::float AS hours,
            COALESCE(sum(b.amount), 0)::float AS revenue,
            to_char(bounds.from_local, 'YYYY-MM-DD') AS from_date,
            to_char(bounds.from_local + ('1 ' || $3)::interval - interval '1 day', 'YYYY-MM-DD') AS to_date
     FROM parking_spaces s
     CROSS JOIN bounds
     LEFT JOIN bookings b
       ON b.space_id = s.id AND b.status = 'confirmed'
      AND b.start_time >= bounds.from_local AT TIME ZONE 'Asia/Kolkata'
      AND b.start_time < (bounds.from_local + ('1 ' || $3)::interval) AT TIME ZONE 'Asia/Kolkata'
     WHERE s.owner_id = $1 AND ($2::int IS NULL OR s.id = $2)
     GROUP BY s.id, s.name, bounds.from_local
     ORDER BY s.name, s.id`,
    [req.user!.id, spaceId, period, day]
  );

  const spaces = rows.map(({ from_date: _from, to_date: _to, ...row }) => ({
    ...row,
    hours: Math.round(row.hours * 100) / 100,
  }));
  res.json({
    period,
    from: rows[0]?.from_date ?? null, // first and last IST day of the period
    to: rows[0]?.to_date ?? null,
    spaces,
    total: {
      bookings: spaces.reduce((sum, row) => sum + row.bookings, 0),
      hours: Math.round(spaces.reduce((sum, row) => sum + row.hours, 0) * 100) / 100,
      revenue: Math.round(spaces.reduce((sum, row) => sum + row.revenue, 0) * 100) / 100,
    },
  });
});
