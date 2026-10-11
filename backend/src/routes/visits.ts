import express, { Router } from "express";
import { config } from "../config";
import { pool } from "../db";
import { dayStartSql, findVisit, gateView, parseDay, staffOfSpaceSql, toVisit, VISIT_SELECT } from "../gate";
import { requireRole } from "../middleware/auth";
import { LATE_MINUTES_SQL, overstayAmount, SETTLEMENTS } from "../overstay";
import { deletePhoto, detectImage, photoFile, savePhoto } from "../photos";
import { parseId } from "../spaces";

export const visitsRouter = Router();

// The vehicle log is for gate staff: a space's owner and its attendants.
// Which space is never taken from the request; it follows from the session.
visitsRouter.use(requireRole("owner", "attendant"));

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const UNIQUE_VIOLATION = "23505";

function cleanVehicleNumber(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().toUpperCase().replace(/\s+/g, " ");
  if (cleaned === "") return null;
  return /^[A-Z0-9 -]{1,20}$/.test(cleaned) ? cleaned : undefined;
}

// GET /visits?date=YYYY-MM-DD&spaceId — incoming/outgoing log, newest first,
// for vehicles that entered on that IST day (default today). Attendants get
// their own space; owners get all their spaces or one of them (spaceId).
visitsRouter.get("/", async (req, res) => {
  const day = parseDay(req.query.date);
  if (day === undefined) return res.status(400).json({ error: "date must look like 2026-01-31" });

  let spaceId: number | null = null;
  if (req.user!.role === "owner" && req.query.spaceId !== undefined && req.query.spaceId !== "") {
    spaceId = parseId(req.query.spaceId);
    if (!spaceId) return res.status(404).json({ error: "Parking space not found" });
  }

  const { rows } = await pool.query(
    `${VISIT_SELECT}
     WHERE ${staffOfSpaceSql("$1")} AND ($2::int IS NULL OR v.space_id = $2)
       AND v.entry_at >= ${dayStartSql("$3")} AT TIME ZONE 'Asia/Kolkata'
       AND v.entry_at < (${dayStartSql("$3")} + interval '1 day') AT TIME ZONE 'Asia/Kolkata'
     ORDER BY v.entry_at DESC, v.id DESC`,
    [req.user!.id, spaceId, day]
  );
  res.json({ visits: rows.map(toVisit), now: new Date().toISOString() });
});

// POST /visits { qr_token, vehicle_number? } — record a vehicle's entry.
// Allowed once per booking, from ENTRY_GRACE_MINUTES before the booking starts
// until it ends. The unique booking_id makes two simultaneous scans safe:
// one inserts, the other gets 409.
visitsRouter.post("/", async (req, res) => {
  const user = req.user!;
  const token = req.body?.qr_token;
  const vehicleNumber = cleanVehicleNumber(req.body?.vehicle_number);
  if (typeof token !== "string" || !token) return res.status(400).json({ error: "qr_token is required" });
  if (vehicleNumber === undefined) {
    return res.status(400).json({ error: "Vehicle number can have letters, numbers, spaces and dashes (up to 20)" });
  }

  let visitId: number | null = null;
  try {
    const inserted = await pool.query(
      `INSERT INTO visits (space_id, booking_id, vehicle_number, entry_by)
       SELECT b.space_id, b.id, $3, $2
       FROM bookings b JOIN parking_spaces s ON s.id = b.space_id
       WHERE b.qr_token = $1 AND b.status = 'confirmed' AND ${staffOfSpaceSql("$2")}
         AND now() >= b.start_time - make_interval(mins => $4::int) AND now() < b.end_time
       RETURNING id`,
      [token, user.id, vehicleNumber, config.entryGraceMinutes]
    );
    visitId = inserted.rows[0]?.id ?? null;
  } catch (err) {
    if ((err as { code?: string }).code !== UNIQUE_VIOLATION) throw err;
  }

  if (!visitId) {
    // Nothing was recorded; say why.
    const view = await gateView(token, user);
    if (!view.valid) return res.status(404).json({ error: "This is not a paid booking for your space" });
    if (view.visit) return res.status(409).json({ error: "Entry was already recorded for this booking" });
    if (view.timing === "over") return res.status(409).json({ error: "This booking has ended" });
    return res.status(409).json({ error: "It is too early to enter for this booking" });
  }
  res.status(201).json({ visit: toVisit(await findVisit(visitId, user)) });
});

// GET /visits/:id — one visit, with the overstay due as of now.
visitsRouter.get("/:id", async (req, res) => {
  const visit = await findVisit(parseId(req.params.id), req.user!);
  if (!visit) return res.status(404).json({ error: "Visit not found" });
  res.json({ visit: toVisit(visit), now: new Date().toISOString() });
});

// POST /visits/:id/exit { settlement?, waive_reason?, amount_shown? }
// Records that the vehicle left, once only. The overstay charge is worked out
// here from the server clock (see overstay.ts). If a charge is due, the
// attendant must say how it was settled: "cash", "upi" or "waived" (with a
// reason). `amount_shown` is the amount the attendant was shown; if the charge
// has grown since, the exit is refused so the right amount is collected.
visitsRouter.post("/:id/exit", async (req, res) => {
  const user = req.user!;
  const visitId = parseId(req.params.id);
  if (!(await findVisit(visitId, user))) return res.status(404).json({ error: "Visit not found" });
  const { settlement, waive_reason, amount_shown } = req.body ?? {};

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Lock the visit so a double tap records one exit and one charge.
    const locked = (
      await client.query(
        `SELECT v.exit_at, s.price_per_hour, ${LATE_MINUTES_SQL} AS late_minutes
         FROM visits v
         JOIN bookings b ON b.id = v.booking_id
         JOIN parking_spaces s ON s.id = v.space_id
         WHERE v.id = $1 FOR UPDATE OF v`,
        [visitId]
      )
    ).rows[0];

    let problem: { status: number; error: string } | null = null;
    const lateMinutes: number = locked.late_minutes;
    const due = overstayAmount(lateMinutes, Number(locked.price_per_hour));
    let reason: string | null = null;

    if (locked.exit_at) problem = { status: 409, error: "Exit was already recorded" };
    else if (due > 0) {
      if (!SETTLEMENTS.includes(settlement)) {
        problem = { status: 400, error: "An overstay charge is due. Choose how it was settled: cash, UPI or waived." };
      } else if (typeof amount_shown === "number" && amount_shown !== due) {
        problem = { status: 409, error: "The overstay charge has changed. Check the new amount." };
      } else if (settlement === "waived") {
        reason = typeof waive_reason === "string" ? waive_reason.trim() : "";
        if (reason.length < 3 || reason.length > 200) {
          problem = { status: 400, error: "Give a short reason for waiving the charge (3 to 200 characters)" };
        }
      }
    }
    if (problem) {
      await client.query("ROLLBACK");
      // Tell the screen what is due right now, so it can show the right amount.
      return res.status(problem.status).json({
        error: problem.error,
        overstay: { minutes: lateMinutes, amount: due },
      });
    }

    await client.query(
      `UPDATE visits SET exit_at = now(), exit_by = $2, overstay_minutes = $3, overstay_amount = $4,
                         overstay_settlement = $5, overstay_waive_reason = $6
       WHERE id = $1`,
      [visitId, user.id, lateMinutes, due, due > 0 ? settlement : "none", reason]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ visit: toVisit(await findVisit(visitId, user)) });
});

// PUT /visits/:id/photo — add or replace the entry photo, until the vehicle
// exits. The body is the raw image (JPEG, PNG or WebP, up to 5 MB).
visitsRouter.put(
  "/:id/photo",
  express.raw({ type: () => true, limit: MAX_PHOTO_BYTES }),
  async (req, res) => {
    const user = req.user!;
    const visit = await findVisit(parseId(req.params.id), user);
    if (!visit) return res.status(404).json({ error: "Visit not found" });
    if (visit.exit_at) return res.status(409).json({ error: "The vehicle has left; the photo can no longer be changed" });

    const image = Buffer.isBuffer(req.body) && req.body.length > 0 ? detectImage(req.body) : null;
    if (!image) return res.status(400).json({ error: "The photo must be a JPEG, PNG or WebP image" });

    const name = await savePhoto(req.body, image.ext);
    // Swap in the new file name and learn the old one, unless the vehicle has left.
    const previous = await pool.query(
      `WITH old AS (SELECT id, entry_photo FROM visits WHERE id = $1 AND exit_at IS NULL FOR UPDATE)
       UPDATE visits v SET entry_photo = $2 FROM old WHERE v.id = old.id
       RETURNING old.entry_photo AS old_photo`,
      [visit.id, name]
    );
    if (previous.rowCount === 0) {
      await deletePhoto(name);
      return res.status(409).json({ error: "The vehicle has left; the photo can no longer be changed" });
    }
    await deletePhoto(previous.rows[0].old_photo);
    res.json({ visit: toVisit(await findVisit(visit.id, user)) });
  }
);

// GET /visits/:id/photo — the entry photo, for the space's staff only.
visitsRouter.get("/:id/photo", async (req, res) => {
  const visitId = parseId(req.params.id);
  const { rows } = visitId
    ? await pool.query(
        `SELECT v.entry_photo FROM visits v JOIN parking_spaces s ON s.id = v.space_id
         WHERE v.id = $1 AND ${staffOfSpaceSql("$2")}`,
        [visitId, req.user!.id]
      )
    : { rows: [] };
  const file = rows[0]?.entry_photo ? photoFile(rows[0].entry_photo) : null;
  if (!file) return res.status(404).json({ error: "Photo not found" });

  res.set({
    "Content-Type": file.mime,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Content-Disposition": "inline",
  });
  res.sendFile(file.path, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: "Photo not found" });
  });
});
