import { randomBytes } from "node:crypto";
import { Router } from "express";
import { holdsSlotSql, overlappingBookingsSql, withinOpeningHoursSql } from "../availability";
import { config } from "../config";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";
import { createOrder, isValidRazorpaySignature, paymentInfo } from "../payments";
import { parseId } from "../spaces";

export const bookingsRouter = Router();

// Bookings belong to customers; every route here needs a customer session.
bookingsRouter.use(requireRole("customer"));

const MIN_BOOKING_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BOOKING_MS = 24 * 60 * 60 * 1000; // 24 hours

// A booking with its space, plus whether an unpaid hold has run out.
// $1 is always the hold duration in minutes.
const BOOKING_SELECT = `
  SELECT b.id, b.user_id, b.space_id, b.start_time, b.end_time, b.amount, b.status,
         b.qr_token, b.created_at,
         s.name AS space_name, s.address AS space_address,
         (b.status = 'pending' AND NOT ${holdsSlotSql("$1")}) AS is_expired,
         b.created_at + make_interval(mins => $1::int) AS hold_expires_at,
         (SELECT p.provider_order_id FROM payments p
          WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) AS order_id,
         v.entry_at, v.exit_at, v.overstay_minutes, v.overstay_amount, v.overstay_settlement
  FROM bookings b
  JOIN parking_spaces s ON s.id = b.space_id
  LEFT JOIN visits v ON v.booking_id = b.id`;

// JSON for a booking. The QR link is only given out once the booking is paid.
function toBooking(row: Record<string, unknown>) {
  const {
    qr_token, user_id: _userId, order_id: _orderId,
    entry_at, exit_at, overstay_minutes, overstay_amount, overstay_settlement,
    ...rest
  } = row;
  return {
    ...rest,
    // Once the vehicle has left: when it came and went, and any overstay charge.
    visit: exit_at
      ? { entry_at, exit_at, overstay_minutes, overstay_amount: Number(overstay_amount), overstay_settlement }
      : null,
    amount: Number(row.amount),
    reference: `PSZ-${String(row.id).padStart(6, "0")}`,
    verify_url: row.status === "confirmed" ? `${config.appBaseUrl}/verify/${qr_token}` : null,
  };
}

async function findBooking(id: number | null, userId: number) {
  if (!id) return null;
  const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.id = $2 AND b.user_id = $3`, [
    config.bookingHoldMinutes, id, userId,
  ]);
  return rows[0] ?? null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// POST /bookings { space_id, start, end } — hold a slot and start a payment.
// The amount is always worked out here from the space's price.
bookingsRouter.post("/", async (req, res) => {
  const spaceId = Number.isInteger(req.body?.space_id) && req.body.space_id > 0 ? req.body.space_id : null;
  const start = parseDate(req.body?.start);
  const end = parseDate(req.body?.end);
  if (!spaceId) return res.status(400).json({ error: "space_id is required" });
  if (!start || !end) return res.status(400).json({ error: "start and end must be valid date-times" });
  if (end <= start) return res.status(400).json({ error: "End time must be after start time" });
  if (start.getTime() <= Date.now()) return res.status(400).json({ error: "Start time must be in the future" });
  const durationMs = end.getTime() - start.getTime();
  if (durationMs < MIN_BOOKING_MS || durationMs > MAX_BOOKING_MS) {
    return res.status(400).json({ error: "A booking must be between 30 minutes and 24 hours long" });
  }

  let bookingId: number;
  let amount: number;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the space so two customers cannot both take the last slot.
    const space = (
      await client.query(
        `SELECT s.id, s.is_active, s.total_slots, s.price_per_hour,
                ${withinOpeningHoursSql("$2", "$3")} AS is_open
         FROM parking_spaces s WHERE s.id = $1 FOR UPDATE`,
        [spaceId, start.toISOString(), end.toISOString()]
      )
    ).rows[0];

    let problem: [number, string] | null = null;
    if (!space || !space.is_active) problem = [404, "Parking space not found"];
    else if (!space.is_open) problem = [400, "The space is closed for some or all of that time"];
    else {
      const { rows } = await client.query(
        `SELECT ${overlappingBookingsSql("$1", "$2", "$3", "$4")} AS taken`,
        [spaceId, start.toISOString(), end.toISOString(), config.bookingHoldMinutes]
      );
      if (rows[0].taken >= space.total_slots) problem = [409, "No slots are free for that time"];
    }
    if (problem) {
      await client.query("ROLLBACK");
      return res.status(problem[0]).json({ error: problem[1] });
    }

    amount = Math.round(Number(space.price_per_hour) * (durationMs / 3_600_000) * 100) / 100;
    const inserted = await client.query(
      `INSERT INTO bookings (user_id, space_id, start_time, end_time, amount, status, qr_token)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6) RETURNING id`,
      [req.user!.id, spaceId, start.toISOString(), end.toISOString(), amount, randomBytes(24).toString("base64url")]
    );
    bookingId = inserted.rows[0].id;
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // The slot is now held. Create the payment order outside the lock; if the
  // provider is unreachable, release the slot again.
  let orderId: string;
  try {
    orderId = await createOrder(bookingId, amount);
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Payment order failed");
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);
    return res.status(502).json({ error: "Could not start the payment. Please try again." });
  }
  await pool.query(
    "INSERT INTO payments (booking_id, provider_order_id, amount, status) VALUES ($1, $2, $3, 'created')",
    [bookingId, orderId, amount]
  );

  const booking = await findBooking(bookingId, req.user!.id);
  res.status(201).json({ booking: toBooking(booking), payment: paymentInfo(orderId) });
});

// GET /bookings — the customer's own bookings, newest first.
bookingsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.user_id = $2 ORDER BY b.created_at DESC, b.id DESC`, [
    config.bookingHoldMinutes, req.user!.id,
  ]);
  res.json({ bookings: rows.map(toBooking) });
});

// GET /bookings/:id — one of the customer's own bookings (receipt data).
bookingsRouter.get("/:id", async (req, res) => {
  const booking = await findBooking(parseId(req.params.id), req.user!.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking: toBooking(booking), payment: paymentInfo(booking.order_id) });
});

// POST /bookings/:id/confirm — check the payment and confirm the booking.
//   mock mode:     { mock_payment_id }
//   razorpay mode: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Confirming an already confirmed booking returns it unchanged.
bookingsRouter.post("/:id/confirm", async (req, res) => {
  const userId = req.user!.id;
  const booking = await findBooking(parseId(req.params.id), userId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "confirmed") return res.json({ booking: toBooking(booking) });
  if (booking.status === "cancelled") return res.status(409).json({ error: "This booking was cancelled" });
  if (booking.is_expired) {
    return res.status(409).json({ error: "This booking was not paid in time and has expired. Please book again." });
  }

  let paymentId: string;
  if (config.paymentMode === "mock") {
    const { mock_payment_id } = req.body ?? {};
    if (typeof mock_payment_id !== "string" || !/^mock_pay_[A-Za-z0-9]{1,40}$/.test(mock_payment_id)) {
      return res.status(400).json({ error: "mock_payment_id is required" });
    }
    paymentId = mock_payment_id;
  } else {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body ?? {};
    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return res.status(400).json({ error: "Payment details are missing" });
    }
    if (
      razorpay_order_id !== booking.order_id ||
      !isValidRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
    ) {
      return res.status(400).json({ error: "Payment could not be verified" });
    }
    paymentId = razorpay_payment_id;
  }

  // Confirm only if still pending and still inside the hold, so a booking
  // cannot be confirmed twice or after its slot was released.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE bookings b SET status = 'confirmed'
       WHERE b.id = $1 AND b.user_id = $2 AND b.status = 'pending' AND ${holdsSlotSql("$3")}`,
      [booking.id, userId, config.bookingHoldMinutes]
    );
    if (updated.rowCount === 1) {
      await client.query(
        "UPDATE payments SET status = 'paid', provider_payment_id = $2 WHERE booking_id = $1 AND provider_order_id = $3",
        [booking.id, paymentId, booking.order_id]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const fresh = await findBooking(booking.id, userId);
  if (fresh.status !== "confirmed") return res.status(409).json({ error: "This booking can no longer be confirmed" });
  res.json({ booking: toBooking(fresh) });
});

// POST /bookings/:id/fail — the payment failed or was given up: record it and
// release the slot by cancelling the pending booking.
bookingsRouter.post("/:id/fail", async (req, res) => {
  const userId = req.user!.id;
  const booking = await findBooking(parseId(req.params.id), userId);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  if (booking.status === "confirmed") return res.status(409).json({ error: "This booking is already paid" });

  if (booking.status === "pending") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await client.query(
        "UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND user_id = $2 AND status = 'pending'",
        [booking.id, userId]
      );
      if (updated.rowCount === 1) {
        await client.query("UPDATE payments SET status = 'failed' WHERE booking_id = $1 AND status = 'created'", [
          booking.id,
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
  res.json({ booking: toBooking(await findBooking(booking.id, userId)) });
});
