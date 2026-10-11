// The overstay rule. A vehicle that leaves after its booked end time may owe
// an extra charge, which the attendant collects at the gate.
//
//   late minutes = whole minutes between the booked end and now (server clock)
//   up to OVERSTAY_GRACE_MINUTES late         -> free
//   later than that                           -> billed from the booked end, in
//       started blocks of OVERSTAY_BLOCK_MINUTES, each block costing
//       price_per_hour x (block / 60) x OVERSTAY_RATE_PERCENT %
//
// With the defaults (10 min grace, 30 min blocks, 100 %) at 40 per hour:
//   10 min late -> 0, 11 min -> 20, 30 min -> 20, 31 min -> 40, 50 min -> 40.
import { config } from "./config";

export const SETTLEMENTS = ["cash", "upi", "waived"] as const;
export type Settlement = (typeof SETTLEMENTS)[number];

// Price of one overstay block at a space.
export function blockAmount(pricePerHour: number): number {
  const amount = pricePerHour * (config.overstayBlockMinutes / 60) * (config.overstayRatePercent / 100);
  return Math.round(amount * 100) / 100;
}

export function overstayAmount(lateMinutes: number, pricePerHour: number): number {
  if (lateMinutes <= config.overstayGraceMinutes) return 0;
  const blocks = Math.ceil(lateMinutes / config.overstayBlockMinutes);
  return Math.round(blocks * blockAmount(pricePerHour) * 100) / 100;
}

// The rule as numbers, sent with each visit so screens can explain the charge
// and show a live estimate. The hourly price is public information.
export function overstayRule(pricePerHour: number) {
  return {
    grace_minutes: config.overstayGraceMinutes,
    block_minutes: config.overstayBlockMinutes,
    block_amount: blockAmount(pricePerHour),
    price_per_hour: pricePerHour,
  };
}

// SQL: whole minutes from the end of booking `b` until now, never negative.
export const LATE_MINUTES_SQL = "GREATEST(floor(extract(epoch FROM now() - b.end_time) / 60), 0)::int";
