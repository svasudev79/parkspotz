// Creating, paying for and reading bookings. The same rules apply whether the
// booking belongs to a logged-in customer or to a guest without an account.
import { randomBytes } from "node:crypto";
import { holdsSlotSql, overlappingBookingsSql, withinOpeningHoursSql } from "./availability";
import { config } from "./config";
import { pool } from "./db";
import { createOrder, isValidRazorpaySignature } from "./payments";

const MIN_BOOKING_MS = 30 * 60 * 1000; // 30 minutes
const MAX_BOOKING_MS = 24 * 60 * 60 * 1000; // 24 hours

export type Failure = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Failure => ({ ok: false, status, error });

// Who a new booking is for.
export type BookingOwner =
  | { userId: number }
  | { guest: { name: string; phone: string; ip: string | null } };

// A booking with its space, plus whether an unpaid hold has run out.
// $1 is always the hold duration in minutes.
export const BOOKING_SELECT = `
  SELECT b.id, b.user_id, b.space_id, b.start_time, b.end_time, b.amount, b.status,
         b.qr_token, b.created_at, b.guest_name, b.guest_phone, b.access_token,
         s.name AS space_name, s.address AS space_address,
         (b.status = 'pending' AND NOT ${holdsSlotSql("$1")}) AS is_expired,
         b.created_at + make_interval(mins => $1::int) AS hold_expires_at,
         (SELECT p.provider_order_id FROM payments p
          WHERE p.booking_id = b.id ORDER BY p.id DESC LIMIT 1) AS order_id,
         v.entry_at, v.exit_at, v.overstay_minutes, v.overstay_amount, v.overstay_settlement
  FROM bookings b
  JOIN parking_spaces s ON s.id = b.space_id
  LEFT JOIN visits v ON v.booking_id = b.id`;

// JSON for a booking, as its customer or guest sees it. The QR link is only
// given out once the booking is paid. `forGuest` adds the guest's own details
// and the token their receipt link is built from.
export function toBooking(row: Record<string, unknown>, forGuest = false) {
  const {
    qr_token, user_id: _userId, order_id: _orderId, guest_name, guest_phone, access_token,
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
    ...(forGuest ? { guest_name, guest_phone, access_token } : {}),
  };
}

// One booking matching `where` (written against BOOKING_SELECT; its own
// parameters start at $2), or null.
export async function findBooking(where: string, params: unknown[]) {
  const { rows } = await pool.query(`${BOOKING_SELECT} WHERE ${where}`, [config.bookingHoldMinutes, ...params]);
  return rows[0] ?? null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Holds a slot and starts a payment. The amount is always worked out here from
// the space's price. In one transaction the space row is locked, so two people
// cannot both take the last slot.
export async function createBooking(
  body: Record<string, unknown> | undefined,
  owner: BookingOwner
): Promise<{ ok: true; bookingId: number; orderId: string } | Failure> {
  const rawSpaceId = body?.space_id;
  const spaceId = typeof rawSpaceId === "number" && Number.isInteger(rawSpaceId) && rawSpaceId > 0 ? rawSpaceId : null;
  const start = parseDate(body?.start);
  const end = parseDate(body?.end);
  if (!spaceId) return fail(400, "space_id is required");
  if (!start || !end) return fail(400, "start and end must be valid date-times");
  if (end <= start) return fail(400, "End time must be after start time");
  if (start.getTime() <= Date.now()) return fail(400, "Start time must be in the future");
  const durationMs = end.getTime() - start.getTime();
  if (durationMs < MIN_BOOKING_MS || durationMs > MAX_BOOKING_MS) {
    return fail(400, "A booking must be between 30 minutes and 24 hours long");
  }

  const guest = "guest" in owner ? owner.guest : null;
  let bookingId: number;
  let amount: number;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const space = (
      await client.query(
        `SELECT s.id, s.is_active, s.total_slots, s.price_per_hour,
                ${withinOpeningHoursSql("$2", "$3")} AS is_open
         FROM parking_spaces s WHERE s.id = $1 FOR UPDATE`,
        [spaceId, start.toISOString(), end.toISOString()]
      )
    ).rows[0];

    let problem: Failure | null = null;
    if (!space || !space.is_active) problem = fail(404, "Parking space not found");
    else if (!space.is_open) problem = fail(400, "The space is closed for some or all of that time");
    else {
      const { rows } = await client.query(
        `SELECT ${overlappingBookingsSql("$1", "$2", "$3", "$4")} AS taken`,
        [spaceId, start.toISOString(), end.toISOString(), config.bookingHoldMinutes]
      );
      if (rows[0].taken >= space.total_slots) problem = fail(409, "No slots are free for that time");
    }
    if (problem) {
      await client.query("ROLLBACK");
      return problem;
    }

    amount = Math.round(Number(space.price_per_hour) * (durationMs / 3_600_000) * 100) / 100;
    const inserted = await client.query(
      `INSERT INTO bookings
         (user_id, space_id, start_time, end_time, amount, status, qr_token,
          guest_name, guest_phone, guest_ip, access_token)
       VALUES ($1, $2, $3, $4, $5, 'pending', $6, $7, $8, $9, $10) RETURNING id`,
      [
        "userId" in owner ? owner.userId : null,
        spaceId, start.toISOString(), end.toISOString(), amount,
        randomBytes(24).toString("base64url"),
        guest?.name ?? null, guest?.phone ?? null, guest?.ip ?? null,
        guest ? randomBytes(32).toString("base64url") : null,
      ]
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
    orderId = await createOrder(`booking_${bookingId}`, amount);
  } catch (err) {
    console.error(err instanceof Error ? err.message : "Payment order failed");
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [bookingId]);
    return fail(502, "Could not start the payment. Please try again.");
  }
  await pool.query(
    "INSERT INTO payments (booking_id, provider_order_id, amount, status) VALUES ($1, $2, $3, 'created')",
    [bookingId, orderId, amount]
  );
  return { ok: true, bookingId, orderId };
}

// Checks the payment for `booking` (a BOOKING_SELECT row the caller is allowed
// to pay) and confirms it.
//   mock mode:     { mock_payment_id }
//   razorpay mode: { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Confirming an already confirmed booking changes nothing.
export async function confirmBooking(
  booking: Record<string, any>,
  body: Record<string, unknown> | undefined
): Promise<{ ok: true } | Failure> {
  if (booking.status === "confirmed") return { ok: true };
  if (booking.status === "cancelled") return fail(409, "This booking was cancelled");
  if (booking.is_expired) return fail(409, "This booking was not paid in time and has expired. Please book again.");

  let paymentId: string;
  if (config.paymentMode === "mock") {
    const mockId = body?.mock_payment_id;
    if (typeof mockId !== "string" || !/^mock_pay_[A-Za-z0-9]{1,40}$/.test(mockId)) {
      return fail(400, "mock_payment_id is required");
    }
    paymentId = mockId;
  } else {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body ?? {};
    if (
      typeof razorpay_order_id !== "string" ||
      typeof razorpay_payment_id !== "string" ||
      typeof razorpay_signature !== "string"
    ) {
      return fail(400, "Payment details are missing");
    }
    if (
      razorpay_order_id !== booking.order_id ||
      !isValidRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)
    ) {
      return fail(400, "Payment could not be verified");
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
       WHERE b.id = $1 AND b.status = 'pending' AND ${holdsSlotSql("$2")}`,
      [booking.id, config.bookingHoldMinutes]
    );
    if (updated.rowCount === 1) {
      await client.query(
        "UPDATE payments SET status = 'paid', provider_payment_id = $2 WHERE booking_id = $1 AND provider_order_id = $3",
        [booking.id, paymentId, booking.order_id]
      );
    }
    await client.query("COMMIT");
    if (updated.rowCount !== 1) {
      const now = await pool.query("SELECT status FROM bookings WHERE id = $1", [booking.id]);
      if (now.rows[0]?.status !== "confirmed") return fail(409, "This booking can no longer be confirmed");
    }
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return { ok: true };
}

// The payment failed or was given up: record it and release the slot by
// cancelling the pending booking.
export async function failBooking(booking: Record<string, any>): Promise<{ ok: true } | Failure> {
  if (booking.status === "confirmed") return fail(409, "This booking is already paid");
  if (booking.status !== "pending") return { ok: true };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE bookings SET status = 'cancelled' WHERE id = $1 AND status = 'pending'",
      [booking.id]
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
  return { ok: true };
}
