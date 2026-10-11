// Guest mode: booking without an account. A guest booking is owned by its
// access_token. The browser that made it keeps its tokens in a signed,
// httpOnly cookie; the token is also in the guest's private receipt link.
import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { pool } from "./db";
import { sessionCookieOptions } from "./session";

export const GUEST_COOKIE = "parkspotz_guest";
const GUEST_DAYS = 30;
const MAX_TOKENS = 30; // newest kept

const guestCookieOptions = { ...sessionCookieOptions, maxAge: GUEST_DAYS * 24 * 60 * 60 * 1000 };

// The booking tokens held by this browser. A cookie that is missing, expired
// or not signed by us counts as empty.
export function guestTokens(req: Request): string[] {
  const raw = req.cookies?.[GUEST_COOKIE];
  if (typeof raw !== "string" || !raw) return [];
  try {
    const payload = jwt.verify(raw, config.jwtSecret, { algorithms: ["HS256"] });
    const tokens = typeof payload === "string" ? null : payload.guest_bookings;
    return Array.isArray(tokens) ? tokens.filter((token): token is string => typeof token === "string") : [];
  } catch {
    return [];
  }
}

export function setGuestTokens(res: Response, tokens: string[]) {
  const signed = jwt.sign({ guest_bookings: tokens.slice(-MAX_TOKENS) }, config.jwtSecret, {
    expiresIn: `${GUEST_DAYS}d`,
    algorithm: "HS256",
  });
  res.cookie(GUEST_COOKIE, signed, guestCookieOptions);
}

export function clearGuestTokens(res: Response) {
  const { maxAge: _maxAge, ...options } = guestCookieOptions;
  res.clearCookie(GUEST_COOKIE, options);
}

// When a guest signs up or logs in as a customer on the same browser, the
// guest bookings in the cookie move to that account and the cookie is cleared.
// Returns how many bookings were attached.
export async function claimGuestBookings(req: Request, res: Response, userId: number): Promise<number> {
  const tokens = guestTokens(req);
  if (tokens.length === 0) return 0;
  const claimed = await pool.query(
    "UPDATE bookings SET user_id = $1 WHERE access_token = ANY($2::text[]) AND user_id IS NULL",
    [userId, tokens]
  );
  clearGuestTokens(res);
  return claimed.rowCount ?? 0;
}

// Name: 2-60 characters. Returns the cleaned name or null.
export function cleanGuestName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  return name.length >= 2 && name.length <= 60 ? name : null;
}

// Indian mobile number: 10 digits starting 6-9. Spaces, dashes and a leading
// +91, 91 or 0 are accepted and removed. Returns the 10 digits or null.
export function cleanGuestPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let digits = value.replace(/[\s()-]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}
