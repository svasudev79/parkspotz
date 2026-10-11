// Shared pieces of the gate feature: who may act for a space, what a visit
// looks like in JSON, and the "check this booking" view used by the verify
// page and the entry/exit endpoints.
import { config } from "./config";
import { pool } from "./db";
import type { SessionUser } from "./session";

// SQL condition: the user in `userParam` is staff of the space aliased `s`,
// i.e. its owner or one of its (still active) attendants. Every gate query
// uses this, so the space always comes from the session, never from the client.
export function staffOfSpaceSql(userParam: string): string {
  return `(s.owner_id = ${userParam} OR EXISTS (
    SELECT 1 FROM space_attendants sa JOIN users su ON su.id = sa.user_id
    WHERE sa.user_id = ${userParam} AND sa.space_id = s.id AND su.is_active))`;
}

export function bookingReference(id: unknown): string {
  return `PSZ-${String(id).padStart(6, "0")}`;
}

// "PSZ-000123", "psz123" or "123" -> 123. Anything else -> null.
export function parseReference(value: unknown): number | null {
  const match = typeof value === "string" ? /^\s*(?:PSZ[-\s]?)?0*([1-9]\d{0,8})\s*$/i.exec(value) : null;
  return match ? Number(match[1]) : null;
}

// A "YYYY-MM-DD" query value, or null for "today in IST". undefined = invalid.
export function parseDay(value: unknown): string | null | undefined {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  return Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) ? undefined : value;
}

// SQL for midnight (IST wall clock) of the day in parameter `p`, today when null.
export const dayStartSql = (p: string) =>
  `date_trunc('day', COALESCE(${p}::date::timestamp, now() AT TIME ZONE 'Asia/Kolkata'))`;

// A visit with its booking. Deliberately has no amount or price: attendants
// must never see money.
export const VISIT_SELECT = `
  SELECT v.id, v.space_id, v.booking_id, v.vehicle_number, v.entry_at, v.exit_at,
         (v.entry_photo IS NOT NULL) AS has_photo,
         eb.username AS entry_by, xb.username AS exit_by,
         b.start_time, b.end_time, cu.username AS customer, s.name AS space_name
  FROM visits v
  JOIN bookings b ON b.id = v.booking_id
  JOIN parking_spaces s ON s.id = v.space_id
  JOIN users cu ON cu.id = b.user_id
  JOIN users eb ON eb.id = v.entry_by
  LEFT JOIN users xb ON xb.id = v.exit_by`;

export function toVisit(row: Record<string, unknown>) {
  const { booking_id, ...visit } = row;
  return { ...visit, reference: bookingReference(booking_id) };
}

// One visit the user is staff for, or null.
export async function findVisit(visitId: number | null, user: SessionUser) {
  if (!visitId) return null;
  const { rows } = await pool.query(`${VISIT_SELECT} WHERE v.id = $1 AND ${staffOfSpaceSql("$2")}`, [
    visitId, user.id,
  ]);
  return rows[0] ?? null;
}

// What gate staff see for a booking's QR code.
//   valid: false — unknown code, unpaid booking, or a booking for a space the
//                  user is not staff of. All three look the same on purpose.
//   timing       — upcoming / current / over, from the booking's time window.
//   can_enter    — no visit yet, and now is between (start - grace) and end.
//   visit        — the recorded entry (and exit), if any.
// Owners also get the amount paid; attendants never do.
export async function gateView(qrToken: string, user: SessionUser) {
  const { rows } = await pool.query(
    `SELECT b.id, b.start_time, b.end_time, b.amount,
            s.name AS space_name, s.address AS space_address, cu.username AS customer,
            CASE WHEN now() < b.start_time THEN 'upcoming'
                 WHEN now() < b.end_time THEN 'current'
                 ELSE 'over' END AS timing,
            b.start_time - make_interval(mins => $3::int) AS entry_opens_at,
            (now() >= b.start_time - make_interval(mins => $3::int) AND now() < b.end_time) AS in_entry_window,
            v.id AS visit_id
     FROM bookings b
     JOIN parking_spaces s ON s.id = b.space_id
     JOIN users cu ON cu.id = b.user_id
     LEFT JOIN visits v ON v.booking_id = b.id
     WHERE b.qr_token = $1 AND b.status = 'confirmed' AND ${staffOfSpaceSql("$2")}`,
    [qrToken, user.id, config.entryGraceMinutes]
  );
  const row = rows[0];
  if (!row) return { valid: false as const };

  const visit = await findVisit(row.visit_id, user);
  return {
    valid: true as const,
    timing: row.timing as "upcoming" | "current" | "over",
    can_enter: !visit && row.in_entry_window === true,
    entry_opens_at: row.entry_opens_at,
    booking: {
      reference: bookingReference(row.id),
      space_name: row.space_name,
      space_address: row.space_address,
      customer: row.customer,
      start_time: row.start_time,
      end_time: row.end_time,
      ...(user.role === "owner" ? { amount: Number(row.amount) } : {}),
    },
    visit: visit ? toVisit(visit) : null,
  };
}
