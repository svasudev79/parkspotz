// API tests for the platform admin and the monthly rental.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { call, createSpace, ist, login, pool, signup, startApp, type Session } from "./helpers";
import { tierFor, validateTiers, type Tier } from "../src/rental";

const DEFAULT_TIERS: Tier[] = [
  { name: "Small", min_slots: 1, max_slots: 20, monthly_fee: 500 },
  { name: "Medium", min_slots: 21, max_slots: 100, monthly_fee: 1500 },
  { name: "Large", min_slots: 101, max_slots: null, monthly_fee: 3000 },
];

let admin: Session;
let ownerA: Session;
let ownerB: Session;
let customer: Session;
let attendant: Session;
let stop: () => Promise<void> = async () => {};

// Moves a space's creation date back by whole months, so it is past its free month.
async function createdMonthsAgo(spaceId: number, months: number) {
  await pool.query("UPDATE parking_spaces SET created_at = created_at - make_interval(months => $2::int) WHERE id = $1", [
    spaceId, months,
  ]);
}

async function spaceWithSlots(owner: Session, slots: number, name: string): Promise<number> {
  const id = await createSpace(owner, 1, name);
  const res = await call(owner, "PATCH", `/spaces/${id}`, { total_slots: slots });
  assert.equal(res.status, 200);
  return id;
}

before(async () => {
  ({ stop } = await startApp());
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('test_admin', $1, 'admin')", [
    await bcrypt.hash("test-password", 4),
  ]);
  admin = await login("test_admin");
  ownerA = await signup("rent_owner_a", "owner");
  ownerB = await signup("rent_owner_b", "owner");
  customer = await signup("rent_customer", "customer");
  const put = await call(admin, "PUT", "/admin/rental/tiers", { tiers: DEFAULT_TIERS });
  assert.equal(put.status, 200);
});

after(() => stop());

test("utilisation: 10 slots x 12 open hours = 120 slot-hours today; one 3-hour booking = 2.5%", async () => {
  // The only space so far: 10 slots, open 08:00-20:00, created last month.
  const spaceId = await spaceWithSlots(ownerA, 10, "Utilisation space");
  await call(ownerA, "PATCH", `/spaces/${spaceId}`, { open_time: "08:00", close_time: "20:00" });
  await createdMonthsAgo(spaceId, 1);

  const booked = await call(customer, "POST", "/bookings", { space_id: spaceId, start: ist(1, "09:00"), end: ist(1, "12:00") });
  assert.equal(booked.status, 201);
  await call(customer, "POST", `/bookings/${booked.body.booking.id}/confirm`, { mock_payment_id: "mock_pay_test" });
  // Move the booking to today, 09:00-12:00 IST.
  await pool.query(
    `UPDATE bookings SET start_time = start_time - interval '1 day', end_time = end_time - interval '1 day' WHERE id = $1`,
    [booked.body.booking.id]
  );

  const dashboard = await call(admin, "GET", "/admin/dashboard");
  assert.equal(dashboard.status, 200);
  assert.deepEqual(dashboard.body.utilisation.day, { booked_hours: 3, available_hours: 120, percent: 2.5 });
  assert.deepEqual(dashboard.body.bookings.day, { count: 1, revenue: 120, guest: 0, registered: 1 });
  assert.equal(dashboard.body.slots.total, 10);
  assert.deepEqual(dashboard.body.spaces, { total: 1, active: 1, inactive: 0, added_this_month: 0 });
  assert.deepEqual(dashboard.body.users, { owners: 2, attendants: 0, customers: 1 });

  // The week holds 7 days of capacity (840 slot-hours) and the same 3 booked hours.
  assert.equal(dashboard.body.utilisation.week.available_hours, 840);
  assert.equal(dashboard.body.utilisation.week.booked_hours, 3);
});

test("tier lookup at the boundaries: 20 slots = Small, 21 = Medium, 100 = Medium, 101 = Large", () => {
  assert.equal(tierFor(1, DEFAULT_TIERS)?.name, "Small");
  assert.equal(tierFor(20, DEFAULT_TIERS)?.name, "Small");
  assert.equal(tierFor(21, DEFAULT_TIERS)?.name, "Medium");
  assert.equal(tierFor(100, DEFAULT_TIERS)?.name, "Medium");
  assert.equal(tierFor(101, DEFAULT_TIERS)?.name, "Large");
  assert.equal(tierFor(5000, DEFAULT_TIERS)?.name, "Large");
});

test("tier edits that overlap, leave a gap, or do not start at 1 are refused", async () => {
  const [small, medium, large] = DEFAULT_TIERS as [Tier, Tier, Tier];
  assert.ok("tiers" in validateTiers(DEFAULT_TIERS));
  const bad: [string, Tier[]][] = [
    ["overlap", [small, { ...medium, min_slots: 20 }, large]],
    ["gap", [small, { ...medium, min_slots: 25 }, large]],
    ["does not start at 1", [{ ...small, min_slots: 2 }, medium, large]],
    ["last tier has an upper limit", [small, medium, { ...large, max_slots: 500 }]],
    ["open-ended tier in the middle", [small, { ...medium, max_slots: null }, large]],
  ];
  for (const [label, tiers] of bad) {
    const res = await call(admin, "PUT", "/admin/rental/tiers", { tiers });
    assert.equal(res.status, 400, label);
    assert.ok(res.body.error.length > 10, label);
  }
  // Nothing changed.
  assert.deepEqual((await call(admin, "GET", "/admin/rental")).body.tiers, DEFAULT_TIERS);
});

test("invoices: creation month is free, then one per month at the tier's fee; generation is idempotent and concurrent-safe", async () => {
  const fresh = await spaceWithSlots(ownerA, 20, "Brand new, 20 slots"); // created this month: free
  const small = await spaceWithSlots(ownerA, 20, "Old, 20 slots");
  const medium = await spaceWithSlots(ownerA, 21, "Old, 21 slots");
  const large = await spaceWithSlots(ownerB, 101, "Old, 101 slots");
  const twoMonths = await spaceWithSlots(ownerB, 100, "Two months old, 100 slots");
  for (const id of [small, medium, large]) await createdMonthsAgo(id, 1);
  await createdMonthsAgo(twoMonths, 2);

  // Many requests at once, each of which generates invoices.
  const results = await Promise.all([
    ...Array.from({ length: 6 }, () => call(admin, "GET", "/admin/rental")),
    call(ownerA, "GET", "/owner/rental"),
    call(ownerB, "GET", "/owner/rental"),
    call(admin, "GET", "/admin/dashboard"),
  ]);
  assert.ok(results.every((r) => r.status === 200));
  await call(admin, "GET", "/admin/rental"); // and again

  const { rows } = await pool.query(
    `SELECT space_id, count(*)::int AS invoices, min(amount)::float AS amount, min(tier_name) AS tier
     FROM rental_invoices GROUP BY space_id`
  );
  const bySpace = new Map(rows.map((row) => [row.space_id, row]));
  assert.equal(bySpace.has(fresh), false, "no invoice in the creation month");
  assert.deepEqual(bySpace.get(small), { space_id: small, invoices: 1, amount: 500, tier: "Small" });
  assert.deepEqual(bySpace.get(medium), { space_id: medium, invoices: 1, amount: 1500, tier: "Medium" });
  assert.deepEqual(bySpace.get(large), { space_id: large, invoices: 1, amount: 3000, tier: "Large" });
  // Two months old: last month and this month.
  assert.deepEqual(bySpace.get(twoMonths), { space_id: twoMonths, invoices: 2, amount: 1500, tier: "Medium" });

  // A later tier change does not touch existing invoices.
  const dearer = DEFAULT_TIERS.map((tier) => ({ ...tier, monthly_fee: tier.monthly_fee * 2 }));
  assert.equal((await call(admin, "PUT", "/admin/rental/tiers", { tiers: dearer })).status, 200);
  await call(admin, "GET", "/admin/rental");
  const after = await pool.query("SELECT amount::float AS amount FROM rental_invoices WHERE space_id = $1", [small]);
  assert.deepEqual(after.rows, [{ amount: 500 }]);
  await call(admin, "PUT", "/admin/rental/tiers", { tiers: DEFAULT_TIERS });
});

test("overdue is derived: a due invoice past its due date, never a paid one", async () => {
  const list = await call(ownerA, "GET", "/owner/rental");
  const invoice = list.body.invoices.find((i: { space_name: string }) => i.space_name === "Old, 20 slots");
  assert.equal(invoice.status, "due");
  assert.match(invoice.due_date, /^\d{4}-\d{2}-07$/);

  await pool.query("UPDATE rental_invoices SET due_date = (now() AT TIME ZONE 'Asia/Kolkata')::date + 1 WHERE id = $1", [invoice.id]);
  assert.equal((await call(ownerA, "GET", `/owner/rental/invoices/${invoice.id}`)).body.invoice.overdue, false);
  await pool.query("UPDATE rental_invoices SET due_date = (now() AT TIME ZONE 'Asia/Kolkata')::date - 1 WHERE id = $1", [invoice.id]);
  assert.equal((await call(ownerA, "GET", `/owner/rental/invoices/${invoice.id}`)).body.invoice.overdue, true);
  assert.ok((await call(admin, "GET", "/admin/rental?status=overdue")).body.invoices.some((i: { id: number }) => i.id === invoice.id));
  assert.ok((await call(admin, "GET", "/admin/dashboard")).body.rental.overdue_count >= 1);

  // Paying it (mock mode) clears the overdue flag.
  assert.equal((await call(ownerA, "POST", `/owner/rental/invoices/${invoice.id}/confirm`, { mock_payment_id: "mock_pay_x" })).status, 400);
  const started = await call(ownerA, "POST", `/owner/rental/invoices/${invoice.id}/pay`);
  assert.equal(started.status, 201);
  assert.equal(started.body.payment.mode, "mock");
  const paid = await call(ownerA, "POST", `/owner/rental/invoices/${invoice.id}/confirm`, { mock_payment_id: "mock_pay_rent" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.invoice.status, "paid");
  assert.equal(paid.body.invoice.overdue, false);
  assert.ok(paid.body.invoice.paid_at);
  // Confirming again changes nothing; paying again is refused.
  assert.equal((await call(ownerA, "POST", `/owner/rental/invoices/${invoice.id}/confirm`, { mock_payment_id: "mock_pay_again" })).body.invoice.paid_at, paid.body.invoice.paid_at);
  assert.equal((await call(ownerA, "POST", `/owner/rental/invoices/${invoice.id}/pay`)).status, 409);

  const totals = (await call(admin, "GET", "/admin/rental")).body.totals;
  assert.equal(totals.collected, 500);
  assert.equal(totals.invoiced, totals.collected + totals.outstanding);
  // Rental payments are kept apart from booking payments.
  const { rows } = await pool.query("SELECT status, amount::float AS amount FROM rental_payments WHERE invoice_id = $1", [invoice.id]);
  assert.deepEqual(rows, [{ status: "paid", amount: 500 }]);
});

test("an owner cannot see or pay another owner's invoice", async () => {
  const mine = (await call(ownerB, "GET", "/owner/rental")).body.invoices;
  assert.ok(mine.length >= 1);
  assert.ok(mine.every((i: { owner: string }) => i.owner === "rent_owner_b"));
  const theirs = mine[0].id;

  assert.equal((await call(ownerA, "GET", `/owner/rental/invoices/${theirs}`)).status, 404);
  assert.equal((await call(ownerA, "POST", `/owner/rental/invoices/${theirs}/pay`)).status, 404);
  assert.equal((await call(ownerA, "POST", `/owner/rental/invoices/${theirs}/confirm`, { mock_payment_id: "mock_pay_x" })).status, 404);
  assert.equal((await call(ownerA, "POST", `/owner/rental/invoices/${theirs}/fail`)).status, 404);
  assert.ok((await call(ownerA, "GET", "/owner/rental")).body.invoices.every((i: { id: number }) => i.id !== theirs));
  assert.equal((await pool.query("SELECT status FROM rental_invoices WHERE id = $1", [theirs])).rows[0].status, "due");
});

test("admin and rental APIs reject every other role and anonymous visitors", async () => {
  const spaceId = await createSpace(ownerA, 5, "Space with an attendant");
  await call(ownerA, "POST", `/owner/spaces/${spaceId}/attendants`, { username: "rent_attendant", password: "test-password" });
  attendant = await login("rent_attendant");

  const adminCalls: [string, string, unknown?][] = [
    ["GET", "/admin/dashboard"],
    ["GET", "/admin/spaces"],
    ["GET", "/admin/rental"],
    ["GET", "/admin/diagnostics"],
    ["PUT", "/admin/rental/tiers", { tiers: DEFAULT_TIERS }],
  ];
  for (const [method, path, body] of adminCalls) {
    for (const [who, session, status] of [
      ["customer", customer, 403], ["owner", ownerA, 403], ["attendant", attendant, 403], ["anonymous", null, 401],
    ] as const) {
      assert.equal((await call(session, method, path, body)).status, status, `${who} ${method} ${path}`);
    }
    assert.equal((await call(admin, method, path, body)).status, 200, `admin ${method} ${path}`);
  }
  // Rental is for owners only: not customers, attendants, anonymous, or the admin.
  for (const [session, status] of [[customer, 403], [attendant, 403], [admin, 403], [null, 401]] as const) {
    assert.equal((await call(session, "GET", "/owner/rental")).status, status);
    assert.equal((await call(session, "POST", "/owner/rental/invoices/1/pay")).status, status);
  }
  // The admin is kept out of the other roles' APIs too.
  for (const path of ["/bookings", "/owner/spaces", "/owner/stats", "/gate/home", "/visits"]) {
    assert.equal((await call(admin, "GET", path)).status, 403, path);
  }
});

test("nobody can sign up as, or be made into, an admin", async () => {
  const res = await call(null, "POST", "/auth/signup", { username: "sneaky_admin", password: "test-password", role: "admin" });
  assert.equal(res.status, 400);
  const attempt = await call(ownerA, "POST", "/owner/spaces/1/attendants", { username: "sneaky_admin2", password: "test-password", role: "admin" });
  if (attempt.status === 201) {
    const { rows } = await pool.query("SELECT role FROM users WHERE username = 'sneaky_admin2'");
    assert.equal(rows[0].role, "attendant");
  }
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin'")).rows[0].n, 1);
});

test("admin spaces list: tier, rental status and sorting", async () => {
  const bySlots = await call(admin, "GET", "/admin/spaces?sort=slots&dir=desc");
  assert.equal(bySlots.status, 200);
  const slots = bySlots.body.spaces.map((s: { total_slots: number }) => s.total_slots);
  assert.deepEqual(slots, [...slots].sort((a, b) => b - a));
  assert.equal(bySlots.body.spaces[0].tier, "Large");

  const find = (name: string) => bySlots.body.spaces.find((s: { name: string }) => s.name === name);
  assert.equal(find("Brand new, 20 slots").rental_status, "free");
  assert.equal(find("Old, 20 slots").rental_status, "paid");
  // Unpaid: "due" up to the 7th of the month, "overdue" after it.
  const pastDueDay = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", day: "numeric" }).format(new Date())) > 7;
  assert.equal(find("Old, 21 slots").rental_status, pastDueDay ? "overdue" : "due");
  assert.equal(find("Utilisation space").utilisation_month.booked_hours, 3);

  const byRental = await call(admin, "GET", "/admin/spaces?sort=rental");
  const order = ["overdue", "due", "paid", "free", "none"];
  const ranks = byRental.body.spaces.map((s: { rental_status: string }) => order.indexOf(s.rental_status));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  // The admin's space list carries no customer details.
  assert.doesNotMatch(JSON.stringify(byRental.body), /rent_customer|phone/);
});

test("admin diagnostics describe the deployment without any secrets", async () => {
  const res = await call(admin, "GET", "/admin/diagnostics", undefined, { "X-Forwarded-For": "203.0.113.50, 198.51.100.7" });
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), [
    "app_base_url", "client_ip", "database", "forwarded_for", "node_env", "payment_mode", "pg_pool_max",
    "secure_cookies", "server_time", "trust_proxy_hops", "uploads_dir", "uploads_writable", "version",
  ]);
  assert.equal(res.body.payment_mode, "mock");
  assert.equal(res.body.database, "ok");
  assert.equal(res.body.uploads_writable, true);
  // With one trusted hop, the caller's address is the last X-Forwarded-For entry.
  assert.equal(res.body.trust_proxy_hops, 1);
  assert.equal(res.body.client_ip, "198.51.100.7");
  assert.equal(res.body.forwarded_for, "203.0.113.50, 198.51.100.7");
  const text = JSON.stringify(res.body);
  assert.ok(!text.includes(process.env.JWT_SECRET!), "no JWT secret");
  assert.doesNotMatch(text, /postgres:\/\/|password|secret|rzp_/i);
});
