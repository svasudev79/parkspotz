import { Router } from "express";
import { bookingReference, dayStartSql, parseReference, staffOfSpaceSql, toVisit, VISIT_SELECT } from "../gate";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";

export const gateRouter = Router();

// GET /gate/home — the attendant's home screen: their space, the vehicles
// inside now (overstaying first, then least time left), and today's paid bookings that have not arrived yet.
// The space is always the one the attendant is attached to. No amounts.
gateRouter.get("/home", requireRole("attendant"), async (req, res) => {
  const userId = req.user!.id;
  const space = (
    await pool.query(
      `SELECT s.id, s.name, s.address, s.total_slots, s.open_time, s.close_time
       FROM parking_spaces s WHERE ${staffOfSpaceSql("$1")}`,
      [userId]
    )
  ).rows[0];
  // No space: the attendant was removed by the owner.
  if (!space) return res.status(403).json({ error: "This attendant account is no longer active" });

  const [inside, expected] = await Promise.all([
    pool.query(`${VISIT_SELECT} WHERE v.space_id = $1 AND v.exit_at IS NULL ORDER BY b.end_time, v.id`, [space.id]),
    pool.query(
      `SELECT b.id, b.qr_token, b.start_time, b.end_time, cu.username AS customer
       FROM bookings b
       JOIN users cu ON cu.id = b.user_id
       WHERE b.space_id = $1 AND b.status = 'confirmed'
         AND b.start_time >= ${dayStartSql("NULL")} AT TIME ZONE 'Asia/Kolkata'
         AND b.start_time < (${dayStartSql("NULL")} + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
         AND NOT EXISTS (SELECT 1 FROM visits v WHERE v.booking_id = b.id)
       ORDER BY b.start_time, b.id`,
      [space.id]
    ),
  ]);

  res.json({
    space: {
      id: space.id,
      name: space.name,
      address: space.address,
      total_slots: space.total_slots,
      open_time: String(space.open_time).slice(0, 5),
      close_time: String(space.close_time).slice(0, 5),
    },
    inside: inside.rows.map(toVisit),
    expected: expected.rows.map(({ id, ...booking }) => ({ ...booking, reference: bookingReference(id) })),
    now: new Date().toISOString(),
  });
});

// GET /gate/lookup?reference=PSZ-000123 — find a paid booking by the reference
// printed on its receipt, for when the QR code will not scan. Only finds
// bookings at a space the caller is staff of; returns the code to check it with.
gateRouter.get("/lookup", requireRole("owner", "attendant"), async (req, res) => {
  const bookingId = parseReference(req.query.reference);
  if (!bookingId) return res.status(400).json({ error: "Enter a booking reference like PSZ-000123" });

  const { rows } = await pool.query(
    `SELECT b.qr_token FROM bookings b JOIN parking_spaces s ON s.id = b.space_id
     WHERE b.id = $1 AND b.status = 'confirmed' AND ${staffOfSpaceSql("$2")}`,
    [bookingId, req.user!.id]
  );
  if (rows.length === 0) return res.status(404).json({ error: "No paid booking with that reference at this space" });
  res.json({ qr_token: rows[0].qr_token });
});
