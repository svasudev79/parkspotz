import QRCode from "qrcode";
import type { Booking } from "./types";

// The receipt's QR code as an image data URL, or null until the booking is
// paid. It holds the link the space's staff open to check the booking at entry.
export async function receiptQr(booking: Booking): Promise<string | null> {
  return booking.verify_url ? QRCode.toDataURL(booking.verify_url, { width: 480, margin: 1 }) : null;
}
