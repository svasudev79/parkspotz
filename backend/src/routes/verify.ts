import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";

export const verifyRouter = Router();

// GET /verify/:qrToken — an owner checks the QR code on a customer's receipt.
// A booking is valid only if it is confirmed and for one of this owner's
// spaces. Anything else (unknown code, unpaid booking, another owner's space)
// gets the same { valid: false }, so nothing about other bookings leaks.
// `timing` says where the booking's time window is relative to now:
//   upcoming (not started), current (started, not ended) or over (ended).
verifyRouter.get("/:qrToken", requireRole("owner"), async (req, res) => {
  const token = String(req.params.qrToken);
  const { rows } = await pool.query(
    `SELECT b.id, b.start_time, b.end_time, b.amount,
            s.name AS space_name, s.address AS space_address, u.username AS customer,
            CASE WHEN now() < b.start_time THEN 'upcoming'
                 WHEN now() < b.end_time THEN 'current'
                 ELSE 'over' END AS timing
     FROM bookings b
     JOIN parking_spaces s ON s.id = b.space_id
     JOIN users u ON u.id = b.user_id
     WHERE b.qr_token = $1 AND b.status = 'confirmed' AND s.owner_id = $2`,
    [token, req.user!.id]
  );
  const row = rows[0];
  if (!row) return res.json({ valid: false });

  const { id, timing, amount, ...booking } = row;
  res.json({
    valid: true,
    timing,
    booking: { ...booking, amount: Number(amount), reference: `PSZ-${String(id).padStart(6, "0")}` },
  });
});
