import "dotenv/config";

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
  // Public address of the frontend; receipt QR codes link to it.
  appBaseUrl: (process.env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  paymentMode: paymentMode(),
  razorpayKeyId,
  razorpayKeySecret,
};
