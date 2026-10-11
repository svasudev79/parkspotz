// Display helpers for time left and overstay. The API decides what is
// actually charged when exit is recorded; these only mirror its rule so the
// screen can show a live figure between page loads.
import { formatRupees } from "./format";
import type { OverstayRule } from "./types";

// 72 -> "1 h 12 min", 45 -> "45 min", 120 -> "2 h"
export function formatDuration(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// Same rule as the API: free up to the grace period, then the whole overstay
// in started blocks.
export function overstayEstimate(lateMinutes: number, rule: OverstayRule): number {
  if (lateMinutes <= rule.grace_minutes) return 0;
  return Math.round(Math.ceil(lateMinutes / rule.block_minutes) * rule.block_amount * 100) / 100;
}

export function describeRule(rule: OverstayRule): string {
  return `Billed at ${formatRupees(rule.price_per_hour)}/hour in ${rule.block_minutes}-minute blocks, after ${rule.grace_minutes} free minutes.`;
}

const SETTLED = { cash: "collected in cash", upi: "collected by UPI", waived: "waived", none: "" };

// "Overstayed 50 min · ₹40 collected in cash", or "" when there was none.
export function describeOverstay(visit: {
  overstay_minutes: number;
  overstay_amount: number;
  overstay_settlement: "none" | "cash" | "upi" | "waived" | null;
}): string {
  if (visit.overstay_minutes <= 0) return "";
  const late = `Overstayed ${formatDuration(visit.overstay_minutes)}`;
  if (visit.overstay_amount <= 0) return `${late} · no charge`;
  return `${late} · ${formatRupees(visit.overstay_amount)} ${SETTLED[visit.overstay_settlement ?? "none"]}`.trim();
}
