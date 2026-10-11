import { Router } from "express";
import { pool } from "../db";
import { requireRole } from "../middleware/auth";
import { generateInvoices, INVOICE_SELECT, loadTiers, THIS_MONTH_SQL, tierFor, toInvoice, validateTiers } from "../rental";

// /admin — for the person who runs ParkSpotZ. Platform-wide numbers, every
// space, and the rental tiers and invoices. Admin role only.
export const adminRouter = Router();

adminRouter.use(requireRole("admin"));

const PERIODS = ["day", "week", "month"] as const;
type Period = (typeof PERIODS)[number];

const round2 = (value: number) => Math.round(value * 100) / 100;
const percent = (booked: number, available: number) => (available > 0 ? round2((booked / available) * 100) : 0);

// SQL: start and end of the current IST day, week (Monday start) or month,
// as timestamps without time zone (IST wall clock).
const periodSql = (period: Period) => ({
  from: `date_trunc('${period}', now() AT TIME ZONE 'Asia/Kolkata')`,
  to: `(date_trunc('${period}', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 ${period}')`,
});

// Per active space, for one period:
//   available = total_slots x daily open hours x days of the period on or
//               after the space's creation date
//   booked    = hours of confirmed bookings that fall inside the period
// Utilisation is booked / available.
function utilisationSql(period: Period): string {
  const { from, to } = periodSql(period);
  return `
    SELECT s.id AS space_id,
           (s.total_slots * extract(epoch FROM s.close_time - s.open_time) / 3600
             * GREATEST(${to}::date - GREATEST(${from}::date, (s.created_at AT TIME ZONE 'Asia/Kolkata')::date), 0)
           )::float AS available,
           COALESCE((
             SELECT sum(extract(epoch FROM
                      LEAST(b.end_time, ${to} AT TIME ZONE 'Asia/Kolkata')
                      - GREATEST(b.start_time, ${from} AT TIME ZONE 'Asia/Kolkata')) / 3600)
             FROM bookings b
             WHERE b.space_id = s.id AND b.status = 'confirmed'
               AND b.start_time < ${to} AT TIME ZONE 'Asia/Kolkata'
               AND b.end_time > ${from} AT TIME ZONE 'Asia/Kolkata'
           ), 0)::float AS booked
    FROM parking_spaces s
    WHERE s.is_active`;
}

// GET /admin/dashboard
adminRouter.get("/dashboard", async (_req, res) => {
  await generateInvoices();
  const tiers = await loadTiers();

  const [spaces, users, inUse, rental, ...periodRows] = await Promise.all([
    pool.query(
      `SELECT id, total_slots, is_active,
              (date_trunc('month', created_at AT TIME ZONE 'Asia/Kolkata')::date = ${THIS_MONTH_SQL}) AS added_this_month
       FROM parking_spaces`
    ),
    pool.query("SELECT role, count(*)::int AS n FROM users WHERE is_active GROUP BY role"),
    pool.query(
      `SELECT (SELECT count(*)::int FROM visits WHERE exit_at IS NULL) AS vehicles_inside,
              (SELECT count(*)::int FROM bookings
               WHERE status = 'confirmed' AND start_time <= now() AND end_time > now()) AS slots_booked_now`
    ),
    pool.query(
      `SELECT COALESCE(sum(amount), 0)::float AS invoiced,
              COALESCE(sum(amount) FILTER (WHERE status = 'paid'), 0)::float AS collected,
              COALESCE(sum(amount) FILTER (WHERE status = 'due'), 0)::float AS outstanding,
              to_char(${THIS_MONTH_SQL}, 'YYYY-MM') AS month,
              (SELECT count(*)::int FROM rental_invoices
               WHERE status = 'due' AND due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date) AS overdue_count
       FROM rental_invoices WHERE month = ${THIS_MONTH_SQL}`
    ),
    ...PERIODS.flatMap((period) => {
      const { from, to } = periodSql(period);
      return [
        pool.query(
          `SELECT COALESCE(sum(available), 0)::float AS available, COALESCE(sum(booked), 0)::float AS booked
           FROM (${utilisationSql(period)}) u`
        ),
        pool.query(
          `SELECT count(*)::int AS count, COALESCE(sum(amount), 0)::float AS revenue,
                  count(*) FILTER (WHERE guest_name IS NOT NULL)::int AS guest,
                  count(*) FILTER (WHERE guest_name IS NULL)::int AS registered
           FROM bookings
           WHERE status = 'confirmed'
             AND start_time >= ${from} AT TIME ZONE 'Asia/Kolkata'
             AND start_time < ${to} AT TIME ZONE 'Asia/Kolkata'`
        ),
      ];
    }),
  ]);

  const userCount = (role: string) => users.rows.find((row) => row.role === role)?.n ?? 0;
  const byTier = tiers.map((tier) => {
    const inTier = spaces.rows.filter((space) => tierFor(space.total_slots, tiers)?.name === tier.name);
    return {
      ...tier,
      spaces: inTier.length,
      slots: inTier.reduce((sum, space) => sum + space.total_slots, 0),
    };
  });

  const utilisation: Record<string, unknown> = {};
  const bookings: Record<string, unknown> = {};
  PERIODS.forEach((period, index) => {
    const use = periodRows[index * 2]!.rows[0];
    utilisation[period] = {
      booked_hours: round2(use.booked),
      available_hours: round2(use.available),
      percent: percent(use.booked, use.available),
    };
    bookings[period] = periodRows[index * 2 + 1]!.rows[0];
  });

  res.json({
    spaces: {
      total: spaces.rows.length,
      active: spaces.rows.filter((space) => space.is_active).length,
      inactive: spaces.rows.filter((space) => !space.is_active).length,
      added_this_month: spaces.rows.filter((space) => space.added_this_month).length,
    },
    users: { owners: userCount("owner"), attendants: userCount("attendant"), customers: userCount("customer") },
    slots: { total: spaces.rows.reduce((sum, space) => sum + space.total_slots, 0), by_tier: byTier },
    in_use: inUse.rows[0],
    utilisation,
    rental: rental.rows[0],
    bookings,
  });
});

const SPACE_SORTS = ["name", "slots", "utilisation", "rental", "created", "bookings"];
// Worst first when sorting by rental status.
const RENTAL_ORDER = ["overdue", "due", "paid", "free", "none"];

// GET /admin/spaces?sort=name|slots|utilisation|rental|created|bookings&dir=asc|desc
adminRouter.get("/spaces", async (req, res) => {
  const sort = SPACE_SORTS.includes(String(req.query.sort)) ? String(req.query.sort) : "name";
  const descending = req.query.dir === "desc";
  await generateInvoices();
  const tiers = await loadTiers();
  const month = periodSql("month");

  const { rows } = await pool.query(
    `SELECT s.id, s.name, s.address, s.total_slots, s.is_active, s.created_at, o.username AS owner,
            u.available, u.booked,
            (SELECT count(*)::int FROM bookings b
             WHERE b.space_id = s.id AND b.status = 'confirmed'
               AND b.start_time >= ${month.from} AT TIME ZONE 'Asia/Kolkata'
               AND b.start_time < ${month.to} AT TIME ZONE 'Asia/Kolkata') AS bookings_month,
            CASE WHEN i.id IS NULL
                   THEN CASE WHEN date_trunc('month', s.created_at AT TIME ZONE 'Asia/Kolkata')::date = ${THIS_MONTH_SQL}
                             THEN 'free' ELSE 'none' END
                 WHEN i.status = 'paid' THEN 'paid'
                 WHEN i.due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'overdue'
                 ELSE 'due' END AS rental_status
     FROM parking_spaces s
     JOIN users o ON o.id = s.owner_id
     LEFT JOIN (${utilisationSql("month")}) u ON u.space_id = s.id
     LEFT JOIN rental_invoices i ON i.space_id = s.id AND i.month = ${THIS_MONTH_SQL}`
  );

  const spaces = rows.map(({ available, booked, ...space }) => ({
    ...space,
    tier: tierFor(space.total_slots, tiers)?.name ?? null,
    utilisation_month: {
      booked_hours: round2(booked ?? 0),
      available_hours: round2(available ?? 0),
      percent: percent(booked ?? 0, available ?? 0),
    },
  }));

  const key = (space: (typeof spaces)[number]): number | string => {
    if (sort === "slots") return space.total_slots;
    if (sort === "utilisation") return space.utilisation_month.percent;
    if (sort === "rental") return RENTAL_ORDER.indexOf(space.rental_status);
    if (sort === "created") return new Date(space.created_at).getTime();
    if (sort === "bookings") return space.bookings_month;
    return space.name.toLowerCase();
  };
  spaces.sort((a, b) => {
    const [x, y] = [key(a), key(b)];
    const order = x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name);
    return descending ? -order : order;
  });
  res.json({ spaces, sort, dir: descending ? "desc" : "asc" });
});

// GET /admin/rental?month=YYYY-MM&status=all|due|paid|overdue
adminRouter.get("/rental", async (req, res) => {
  const status = ["due", "paid", "overdue"].includes(String(req.query.status)) ? String(req.query.status) : "all";
  const monthParam = typeof req.query.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month)
    ? req.query.month
    : null;
  if (req.query.month !== undefined && req.query.month !== "" && !monthParam) {
    return res.status(400).json({ error: "month must look like 2026-01" });
  }
  await generateInvoices();

  // $1 is the chosen month's first day, or null for the current IST month.
  const monthSql = `COALESCE(($1::text || '-01')::date, ${THIS_MONTH_SQL})`;
  const all = await pool.query(`${INVOICE_SELECT} WHERE i.month = ${monthSql} ORDER BY s.name, i.id`, [monthParam]);
  const shown = all.rows.filter((row) =>
    status === "all" ? true : status === "overdue" ? row.overdue : row.status === status
  );
  const sum = (rows: typeof all.rows) => round2(rows.reduce((total, row) => total + row.amount, 0));
  const monthRow = await pool.query(`SELECT to_char(${monthSql}, 'YYYY-MM') AS month`, [monthParam]);

  res.json({
    month: monthRow.rows[0].month,
    status,
    tiers: await loadTiers(),
    invoices: shown.map(toInvoice),
    // Totals are for the whole month, whatever status filter is applied.
    totals: {
      invoices: all.rows.length,
      invoiced: sum(all.rows),
      collected: sum(all.rows.filter((row) => row.status === "paid")),
      outstanding: sum(all.rows.filter((row) => row.status === "due")),
      overdue_count: all.rows.filter((row) => row.overdue).length,
    },
  });
});

// PUT /admin/rental/tiers { tiers: [{ name, min_slots, max_slots, monthly_fee }] }
// Replaces the whole set of tiers, after checking it has no gaps or overlaps.
// Existing invoices keep the amount they were made with.
adminRouter.put("/rental/tiers", async (req, res) => {
  const result = validateTiers(req.body?.tiers);
  if ("error" in result) return res.status(400).json({ error: result.error });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE rental_tiers IN ACCESS EXCLUSIVE MODE");
    await client.query("DELETE FROM rental_tiers");
    for (const tier of result.tiers) {
      await client.query(
        "INSERT INTO rental_tiers (name, min_slots, max_slots, monthly_fee) VALUES ($1, $2, $3, $4)",
        [tier.name, tier.min_slots, tier.max_slots, tier.monthly_fee]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  res.json({ tiers: await loadTiers() });
});
