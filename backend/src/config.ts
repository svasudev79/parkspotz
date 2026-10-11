import "dotenv/config";
import { resolve } from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable ${name} (see backend/.env.example)`);
  return value;
}

const razorpayKeyId = process.env.RAZORPAY_KEY_ID ?? "";
const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
const hasRazorpayKeys = razorpayKeyId !== "" && razorpayKeySecret !== "";

// "mock" shows an in-app test payment screen; "razorpay" uses Razorpay Checkout.
// Without PAYMENT_MODE, Razorpay is used only when both keys are set.
function paymentMode(): "mock" | "razorpay" {
  const mode = process.env.PAYMENT_MODE || (hasRazorpayKeys ? "razorpay" : "mock");
  if (mode !== "mock" && mode !== "razorpay") throw new Error("PAYMENT_MODE must be mock or razorpay");
  if (mode === "razorpay" && !hasRazorpayKeys) {
    throw new Error("PAYMENT_MODE=razorpay needs RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET");
  }
  return mode;
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  // Minutes an unpaid (pending) booking keeps its slot.
  bookingHoldMinutes: Number(process.env.BOOKING_HOLD_MINUTES ?? 10),
  // Minutes before a booking's start time from which entry may be recorded.
  entryGraceMinutes: Number(process.env.ENTRY_GRACE_MINUTES ?? 15),
  // Overstay: the first `overstayGraceMinutes` after the booked end are free;
  // beyond that the whole overstay is billed in started blocks of
  // `overstayBlockMinutes`, at `overstayRatePercent` % of the hourly price.
  overstayGraceMinutes: Number(process.env.OVERSTAY_GRACE_MINUTES ?? 10),
  overstayBlockMinutes: Number(process.env.OVERSTAY_BLOCK_MINUTES ?? 30),
  overstayRatePercent: Number(process.env.OVERSTAY_RATE_PERCENT ?? 100),
  // Guests (no account) may hold at most this many unpaid bookings at once,
  // counted per browser and per IP address.
  guestMaxPending: Number(process.env.GUEST_MAX_PENDING ?? 2),
  // How many reverse proxies sit in front of the API. 1 = the Next.js /api
  // rewrite. Only that many X-Forwarded-For entries (from the right) are trusted.
  trustProxyHops: Number(process.env.TRUST_PROXY_HOPS ?? 1),
  // Day of the month on which a rental invoice falls due.
  rentalDueDay: Math.min(Math.max(Number(process.env.RENTAL_DUE_DAY ?? 7), 1), 28),
  // Folder for entry photos. Never served directly; see routes/visits.ts.
  uploadsDir: resolve(process.env.UPLOADS_DIR ?? "uploads"),
  // Public address of the frontend; receipt QR codes link to it.
  appBaseUrl: (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  paymentMode: paymentMode(),
  razorpayKeyId,
  razorpayKeySecret,
};
