// Monthly rental: what a space owner pays ParkSpotZ for hosting a space.
// The fee depends on the space's size (its tier). There is one invoice per
// space per calendar month (IST). The month a space was created in is free.
import { config } from "./config";
import { pool } from "./db";

export interface Tier {
  name: string;
  min_slots: number;
  max_slots: number | null; // null = no upper limit
  monthly_fee: number;
}

// The tier a space with this many slots falls in.
export function tierFor(slots: number, tiers: Tier[]): Tier | null {
  return tiers.find((t) => slots >= t.min_slots && (t.max_slots === null || slots <= t.max_slots)) ?? null;
}

// Checks a full set of tiers: they must start at 1 slot and continue without
// gaps or overlaps, and only the last may be open-ended.
// Returns the cleaned tiers in order, or an error message.
export function validateTiers(input: unknown): { tiers: Tier[] } | { error: string } {
  if (!Array.isArray(input) || input.length === 0) return { error: "At least one tier is needed" };
  if (input.length > 20) return { error: "Too many tiers" };

  const tiers: Tier[] = [];
  for (const raw of input) {
    const name = typeof raw?.name === "string" ? raw.name.trim() : "";
    const { min_slots, max_slots, monthly_fee } = raw ?? {};
    if (name.length < 1 || name.length > 40) return { error: "Every tier needs a name (up to 40 characters)" };
    if (!Number.isInteger(min_slots) || min_slots < 1) return { error: `${name}: "from" must be a whole number, 1 or more` };
    if (max_slots !== null && (!Number.isInteger(max_slots) || max_slots < min_slots)) {
      return { error: `${name}: "to" must be a whole number, at least ${min_slots}, or empty for no limit` };
    }
    if (typeof monthly_fee !== "number" || !Number.isFinite(monthly_fee) || monthly_fee < 0 || monthly_fee > 1_000_000) {
      return { error: `${name}: the monthly fee must be 0 or more` };
    }
    tiers.push({ name, min_slots, max_slots, monthly_fee: Math.round(monthly_fee * 100) / 100 });
  }
  tiers.sort((a, b) => a.min_slots - b.min_slots);

  if (new Set(tiers.map((t) => t.name.toLowerCase())).size !== tiers.length) return { error: "Tier names must be different" };
  if (tiers[0]!.min_slots !== 1) return { error: "The first tier must start at 1 slot" };
  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i]!;
    const next = tiers[i + 1];
    if (!next) {
      if (tier.max_slots !== null) return { error: `The last tier (${tier.name}) must have no upper limit` };
    } else if (tier.max_slots === null) {
      return { error: `Only the last tier can have no upper limit; ${tier.name} overlaps ${next.name}` };
    } else if (next.min_slots <= tier.max_slots) {
      return { error: `${tier.name} and ${next.name} overlap: both cover ${next.min_slots} slots` };
    } else if (next.min_slots !== tier.max_slots + 1) {
      return { error: `There is a gap between ${tier.name} and ${next.name}: no tier covers ${tier.max_slots + 1} slots` };
    }
  }
  return { tiers };
}

export async function loadTiers(): Promise<Tier[]> {
  const { rows } = await pool.query(
    "SELECT name, min_slots, max_slots, monthly_fee::float AS monthly_fee FROM rental_tiers ORDER BY min_slots"
  );
  return rows;
}

// SQL: the first day of the current IST month, as a date.
export const THIS_MONTH_SQL = "date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date";
// SQL: today's IST date.
export const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Kolkata')::date";

// Creates any missing invoices: for every listed (active) space, one for each
// month after its creation month up to the current month, at the fee of the
// tier its slot count is in right now. There is no background job; this runs
// whenever a rental page or the admin dashboard loads, and from
// `npm run rental:generate`. The unique (space_id, month) makes it safe to
// run repeatedly and at the same time. Returns how many invoices it made.
export async function generateInvoices(): Promise<number> {
  const result = await pool.query(
    `INSERT INTO rental_invoices (space_id, month, tier_name, slots, amount, due_date)
     SELECT s.id, m.month::date, t.name, s.total_slots, t.monthly_fee,
            (m.month + make_interval(days => $1::int - 1))::date
     FROM parking_spaces s
     JOIN rental_tiers t
       ON s.total_slots >= t.min_slots AND (t.max_slots IS NULL OR s.total_slots <= t.max_slots)
     CROSS JOIN LATERAL generate_series(
       date_trunc('month', s.created_at AT TIME ZONE 'Asia/Kolkata') + interval '1 month',
       ${THIS_MONTH_SQL}::timestamp,
       interval '1 month'
     ) AS m(month)
     WHERE s.is_active
     ON CONFLICT (space_id, month) DO NOTHING`,
    [config.rentalDueDay]
  );
  return result.rowCount ?? 0;
}

// An invoice with its space. `overdue` is worked out here: due and past the due date.
export const INVOICE_SELECT = `
  SELECT i.id, i.space_id, s.name AS space_name, s.owner_id, o.username AS owner,
         to_char(i.month, 'YYYY-MM') AS month, i.tier_name, i.slots, i.amount::float AS amount,
         to_char(i.due_date, 'YYYY-MM-DD') AS due_date, i.status, i.paid_at,
         (i.status = 'due' AND i.due_date < ${TODAY_SQL}) AS overdue
  FROM rental_invoices i
  JOIN parking_spaces s ON s.id = i.space_id
  JOIN users o ON o.id = s.owner_id`;

export function toInvoice(row: Record<string, unknown>) {
  const { owner_id: _ownerId, ...invoice } = row;
  return { ...invoice, reference: `RNT-${String(row.id).padStart(6, "0")}` };
}
