// Payment provider calls. Two modes share one booking flow:
//   mock     — no provider; the in-app test screen reports pay or fail.
//   razorpay — a Razorpay order is created here and Checkout runs in the browser.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { config } from "./config";

// Creates the provider order for a booking and returns its id.
export async function createOrder(bookingId: number, amountRupees: number): Promise<string> {
  if (config.paymentMode === "mock") return `mock_order_${randomBytes(9).toString("hex")}`;

  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      amount: Math.round(amountRupees * 100), // Razorpay amounts are in paise
      currency: "INR",
      receipt: `booking_${bookingId}`,
    }),
  });
  if (!res.ok) throw new Error(`Razorpay order creation failed with status ${res.status}`);
  const order = (await res.json()) as { id?: unknown };
  if (typeof order.id !== "string") throw new Error("Razorpay order response had no id");
  return order.id;
}

// Razorpay signs "<order_id>|<payment_id>" with the key secret (HMAC-SHA256, hex).
export function isValidRazorpaySignature(orderId: string, paymentId: string, signature: string): boolean {
  const expected = createHmac("sha256", config.razorpayKeySecret).update(`${orderId}|${paymentId}`).digest("hex");
  const given = Buffer.from(signature, "utf8");
  const wanted = Buffer.from(expected, "utf8");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

// What the browser needs to start paying for an order.
export function paymentInfo(orderId: string | null) {
  return {
    mode: config.paymentMode,
    order_id: orderId,
    currency: "INR",
    ...(config.paymentMode === "razorpay" ? { key_id: config.razorpayKeyId } : {}),
  };
}
