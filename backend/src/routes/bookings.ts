import { Router } from "express";
import { BOOKING_SELECT, confirmBooking, createBooking, failBooking, findBooking, toBooking } from "../booking-service";
import { config } from "../config";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";
import { paymentInfo } from "../payments";
import { parseId } from "../spaces";

export const bookingsRouter = Router();

// A logged-in customer's bookings. Guests (no account) use /guest instead.
bookingsRouter.use(requireRole("customer"));

// The customer's own booking with this id, or null.
function ownBooking(id: number | null, userId: number) {
  return id ? findBooking("b.id = $2 AND b.user_id = $3", [id, userId]) : null;
}

// POST /bookings { space_id, start, end } — hold a slot and start a payment.
bookingsRouter.post("/", async (req, res) => {
  const result = await createBooking(req.body, { userId: req.user!.id });
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  const booking = await ownBooking(result.bookingId, req.user!.id);
  res.status(201).json({ booking: toBooking(booking), payment: paymentInfo(result.orderId) });
});

// GET /bookings — the customer's own bookings, newest first.
bookingsRouter.get("/", async (req, res) => {
  const { rows } = await pool.query(`${BOOKING_SELECT} WHERE b.user_id = $2 ORDER BY b.created_at DESC, b.id DESC`, [
    config.bookingHoldMinutes, req.user!.id,
  ]);
  res.json({ bookings: rows.map((row) => toBooking(row)) });
});

// GET /bookings/:id — one of the customer's own bookings (receipt data).
bookingsRouter.get("/:id", async (req, res) => {
  const booking = await ownBooking(parseId(req.params.id), req.user!.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking: toBooking(booking), payment: paymentInfo(booking.order_id) });
});

// POST /bookings/:id/confirm — check the payment and confirm the booking.
bookingsRouter.post("/:id/confirm", async (req, res) => {
  const booking = await ownBooking(parseId(req.params.id), req.user!.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const result = await confirmBooking(booking, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ booking: toBooking(await ownBooking(booking.id, req.user!.id)) });
});

// POST /bookings/:id/fail — the payment failed or was given up.
bookingsRouter.post("/:id/fail", async (req, res) => {
  const booking = await ownBooking(parseId(req.params.id), req.user!.id);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const result = await failBooking(booking);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ booking: toBooking(await ownBooking(booking.id, req.user!.id)) });
});
