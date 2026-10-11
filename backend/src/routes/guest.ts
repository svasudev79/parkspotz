import { Router } from "express";
import { holdsSlotSql } from "../availability";
import { BOOKING_SELECT, confirmBooking, createBooking, failBooking, findBooking, toBooking } from "../booking-service";
import { config } from "../config";
import { pool } from "../db";
import { cleanGuestName, cleanGuestPhone, guestTokens, setGuestTokens } from "../guest";
import { paymentInfo } from "../payments";

// /guest — booking, paying and reading a receipt without an account.
// No session is needed. A booking is reached only through its access_token
// (from this browser's guest cookie or from the receipt link); any other
// token gets 404, so one guest can never touch another person's booking.
export const guestRouter = Router();

// A booking by its access token. Only bookings made as a guest have one.
function byToken(token: unknown) {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(token)
    ? findBooking("b.access_token = $2", [token])
    : null;
}

// POST /guest/bookings { space_id, start, end, name, phone }
guestRouter.post("/bookings", async (req, res) => {
  const name = cleanGuestName(req.body?.name);
  const phone = cleanGuestPhone(req.body?.phone);
  if (!name) return res.status(400).json({ error: "Enter your name (2 to 60 characters)" });
  if (!phone) return res.status(400).json({ error: "Enter a 10-digit Indian mobile number" });

  // Anyone can reach this, so cap the slots one browser, one address or one
  // mobile number can hold without paying. Paid, cancelled and expired bookings do not count.
  const tokens = guestTokens(req);
  const ip = req.ip ?? null;
  const held = await pool.query(
    `SELECT count(*) FILTER (WHERE b.access_token = ANY($2::text[]))::int AS by_browser,
            count(*) FILTER (WHERE b.guest_ip = $3)::int AS by_address,
            count(*) FILTER (WHERE b.guest_phone = $4)::int AS by_phone
     FROM bookings b
     WHERE b.user_id IS NULL AND b.status = 'pending' AND ${holdsSlotSql("$1")}`,
    [config.bookingHoldMinutes, tokens, ip, phone]
  );
  const { by_browser, by_address, by_phone } = held.rows[0];
  if (by_phone >= config.guestMaxPending) {
    return res.status(429).json({
      error: `There are already ${config.guestMaxPending} unpaid bookings for this mobile number. Pay for one or wait a few minutes, then try again.`,
    });
  }
  if (by_browser >= config.guestMaxPending || by_address >= config.guestMaxPending) {
    return res.status(429).json({
      error: `You already have ${config.guestMaxPending} unpaid bookings. Pay for one or wait a few minutes, then try again.`,
    });
  }

  const result = await createBooking(req.body, { guest: { name, phone, ip } });
  if (!result.ok) return res.status(result.status).json({ error: result.error });

  const booking = await findBooking("b.id = $2", [result.bookingId]);
  setGuestTokens(res, [...tokens, booking.access_token]);
  res.status(201).json({ booking: toBooking(booking, true), payment: paymentInfo(result.orderId) });
});

// GET /guest/bookings — the guest bookings made in this browser, newest first.
guestRouter.get("/bookings", async (req, res) => {
  const tokens = guestTokens(req);
  const { rows } = tokens.length
    ? await pool.query(
        `${BOOKING_SELECT} WHERE b.access_token = ANY($2::text[]) AND b.user_id IS NULL
         ORDER BY b.created_at DESC, b.id DESC`,
        [config.bookingHoldMinutes, tokens]
      )
    : { rows: [] };
  res.json({ bookings: rows.map((row) => toBooking(row, true)) });
});

// GET /guest/bookings/:token — one guest booking (receipt data).
guestRouter.get("/bookings/:token", async (req, res) => {
  const booking = await byToken(req.params.token);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  res.json({ booking: toBooking(booking, true), payment: paymentInfo(booking.order_id) });
});

// POST /guest/bookings/:token/confirm — check the payment and confirm.
guestRouter.post("/bookings/:token/confirm", async (req, res) => {
  const booking = await byToken(req.params.token);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const result = await confirmBooking(booking, req.body);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ booking: toBooking(await byToken(req.params.token), true) });
});

// POST /guest/bookings/:token/fail — the payment failed or was given up.
guestRouter.post("/bookings/:token/fail", async (req, res) => {
  const booking = await byToken(req.params.token);
  if (!booking) return res.status(404).json({ error: "Booking not found" });
  const result = await failBooking(booking);
  if (!result.ok) return res.status(result.status).json({ error: result.error });
  res.json({ booking: toBooking(await byToken(req.params.token), true) });
});
