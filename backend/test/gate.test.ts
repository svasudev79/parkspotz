// API tests for the gate attendant role: an attendant only reaches their own
// space, entry is recorded at most once per booking, and attendants never
// see money.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { call, createSpace, ist, login, pool, rawCall, signup, startApp, type Session } from "./helpers";

// The smallest valid PNG: a 1x1 transparent pixel.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64"
);

let owner: Session;
let otherOwner: Session;
let customer: Session;
let attendantA: Session; // works at space A
let attendantB: Session; // works at space B (same owner)
let spaceA: number;
let spaceB: number;
let nextDay = 1;
let stop: () => Promise<void> = async () => {};

// Books and pays for a slot, then moves the booking in time so that it started
// `startedMinutesAgo` minutes ago and runs for two hours. Returns its QR token.
async function paidBooking(spaceId: number, startedMinutesAgo: number): Promise<{ id: number; token: string }> {
  const day = nextDay++;
  const booked = await call(customer, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "10:00"),
    end: ist(day, "12:00"),
  });
  assert.equal(booked.status, 201);
  const id: number = booked.body.booking.id;
  const paid = await call(customer, "POST", `/bookings/${id}/confirm`, { mock_payment_id: "mock_pay_test" });
  assert.equal(paid.body.booking.status, "confirmed");

  const { rows } = await pool.query(
    `UPDATE bookings SET start_time = now() - make_interval(mins => $2::int),
                         end_time = now() - make_interval(mins => $2::int) + interval '2 hours'
     WHERE id = $1 RETURNING qr_token`,
    [id, startedMinutesAgo]
  );
  return { id, token: rows[0].qr_token };
}

async function createAttendant(spaceId: number, username: string): Promise<Session> {
  const created = await call(owner, "POST", `/owner/spaces/${spaceId}/attendants`, {
    username,
    password: "test-password",
  });
  assert.equal(created.status, 201);
  return login(username);
}

before(async () => {
  ({ stop } = await startApp());
  owner = await signup("gate_owner", "owner");
  otherOwner = await signup("gate_other_owner", "owner");
  customer = await signup("gate_customer", "customer");
  spaceA = await createSpace(owner, 5, "Space A");
  spaceB = await createSpace(owner, 5, "Space B");
  attendantA = await createAttendant(spaceA, "gate_attendant_a");
  attendantB = await createAttendant(spaceB, "gate_attendant_b");
});

after(() => stop());

test("public signup refuses the attendant role", async () => {
  const res = await call(null, "POST", "/auth/signup", {
    username: "sneaky_attendant",
    password: "test-password",
    role: "attendant",
  });
  assert.equal(res.status, 400);
});

test("only the space's owner can create attendants", async () => {
  const body = { username: "gate_attendant_x", password: "test-password" };
  assert.equal((await call(otherOwner, "POST", `/owner/spaces/${spaceA}/attendants`, body)).status, 404);
  assert.equal((await call(customer, "POST", `/owner/spaces/${spaceA}/attendants`, body)).status, 403);
  assert.equal((await call(attendantA, "POST", `/owner/spaces/${spaceA}/attendants`, body)).status, 403);
  assert.equal((await call(null, "POST", `/owner/spaces/${spaceA}/attendants`, body)).status, 401);
});

test("entry, photo and exit: the full gate flow, once per booking", async () => {
  const { token } = await paidBooking(spaceA, 10);

  const before = await call(attendantA, "GET", `/verify/${token}`);
  assert.equal(before.body.valid, true);
  assert.equal(before.body.timing, "current");
  assert.equal(before.body.can_enter, true);
  assert.equal(before.body.visit, null);

  // Exit cannot come before entry: there is no visit to exit yet.
  assert.equal((await call(attendantA, "POST", "/visits/999999/exit")).status, 404);

  const entry = await call(attendantA, "POST", "/visits", { qr_token: token, vehicle_number: "ka 01 ab 1234" });
  assert.equal(entry.status, 201);
  assert.equal(entry.body.visit.vehicle_number, "KA 01 AB 1234");
  assert.equal(entry.body.visit.entry_by, "gate_attendant_a");
  const visitId: number = entry.body.visit.id;

  // A second entry for the same booking is refused.
  const again = await call(attendantA, "POST", "/visits", { qr_token: token });
  assert.equal(again.status, 409);

  // Photo: real images only, and only staff of the space can fetch it.
  assert.equal((await rawCall(attendantA, "PUT", `/visits/${visitId}/photo`, Buffer.from("<html>not an image</html>"))).status, 400);
  assert.equal((await rawCall(attendantA, "PUT", `/visits/${visitId}/photo`, Buffer.alloc(6 * 1024 * 1024, 1))).status, 413);
  assert.equal((await rawCall(attendantA, "PUT", `/visits/${visitId}/photo`, PNG)).status, 200);
  const photo = await rawCall(attendantA, "GET", `/visits/${visitId}/photo`);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.equal(photo.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), PNG);
  assert.equal((await rawCall(owner, "GET", `/visits/${visitId}/photo`)).status, 200);
  assert.equal((await rawCall(null, "GET", `/visits/${visitId}/photo`)).status, 401);
  assert.equal((await rawCall(customer, "GET", `/visits/${visitId}/photo`)).status, 403);
  assert.equal((await rawCall(attendantB, "GET", `/visits/${visitId}/photo`)).status, 404);
  assert.equal((await rawCall(otherOwner, "GET", `/visits/${visitId}/photo`)).status, 404);

  // The other space's attendant cannot record the exit either.
  assert.equal((await call(attendantB, "POST", `/visits/${visitId}/exit`)).status, 404);

  const exit = await call(attendantA, "POST", `/visits/${visitId}/exit`);
  assert.equal(exit.status, 200);
  assert.ok(exit.body.visit.exit_at);
  assert.equal((await call(attendantA, "POST", `/visits/${visitId}/exit`)).status, 409);
  // After exit the photo is frozen and the booking stays used.
  assert.equal((await rawCall(attendantA, "PUT", `/visits/${visitId}/photo`, PNG)).status, 409);
  assert.equal((await call(attendantA, "POST", "/visits", { qr_token: token })).status, 409);

  const after = await call(attendantA, "GET", `/verify/${token}`);
  assert.equal(after.body.can_enter, false);
  assert.ok(after.body.visit.exit_at);
});

test("two simultaneous entry requests for one booking create one visit", async () => {
  for (let round = 0; round < 5; round++) {
    const { id, token } = await paidBooking(spaceA, 5);
    const results = await Promise.all([
      call(attendantA, "POST", "/visits", { qr_token: token }),
      call(owner, "POST", "/visits", { qr_token: token }),
      call(attendantA, "POST", "/visits", { qr_token: token }),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409]);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM visits WHERE booking_id = $1", [id]);
    assert.equal(rows[0].n, 1);
  }
});

test("an attendant cannot see or use a booking for another space", async () => {
  const { id, token } = await paidBooking(spaceB, 5);

  // Attendant A works at space A; this booking is for space B.
  assert.deepEqual((await call(attendantA, "GET", `/verify/${token}`)).body, { valid: false });
  assert.equal((await call(attendantA, "POST", "/visits", { qr_token: token })).status, 404);
  assert.equal((await call(attendantA, "GET", `/gate/lookup?reference=PSZ-${id}`)).status, 404);
  // An owner of other spaces gets the same answers.
  assert.deepEqual((await call(otherOwner, "GET", `/verify/${token}`)).body, { valid: false });
  assert.equal((await call(otherOwner, "POST", "/visits", { qr_token: token })).status, 404);

  // The space's own attendant can find and use it.
  const found = await call(attendantB, "GET", `/gate/lookup?reference=PSZ-${String(id).padStart(6, "0")}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.qr_token, token);
  const entry = await call(attendantB, "POST", "/visits", { qr_token: token });
  assert.equal(entry.status, 201);

  // Histories and home screens stay separate per space.
  const historyA = await call(attendantA, "GET", "/visits");
  assert.ok(historyA.body.visits.every((v: { space_id: number }) => v.space_id === spaceA));
  const homeA = await call(attendantA, "GET", "/gate/home");
  assert.equal(homeA.body.space.id, spaceA);
  assert.ok(homeA.body.inside.every((v: { space_id: number }) => v.space_id === spaceA));
  // A spaceId in the query does not widen an attendant's view.
  const sneaky = await call(attendantA, "GET", `/visits?spaceId=${spaceB}`);
  assert.ok(sneaky.body.visits.every((v: { space_id: number }) => v.space_id === spaceA));
  assert.equal((await call(attendantA, "POST", `/visits/${entry.body.visit.id}/exit`)).status, 404);
});

test("entry is only allowed from 15 minutes before the start until the end", async () => {
  const tooEarly = await paidBooking(spaceA, -60); // starts in an hour
  const view = await call(attendantA, "GET", `/verify/${tooEarly.token}`);
  assert.equal(view.body.timing, "upcoming");
  assert.equal(view.body.can_enter, false);
  assert.equal((await call(attendantA, "POST", "/visits", { qr_token: tooEarly.token })).status, 409);

  const inGrace = await paidBooking(spaceA, -10); // starts in ten minutes
  assert.equal((await call(attendantA, "GET", `/verify/${inGrace.token}`)).body.can_enter, true);
  assert.equal((await call(attendantA, "POST", "/visits", { qr_token: inGrace.token })).status, 201);

  const over = await paidBooking(spaceA, 180); // ended an hour ago
  assert.equal((await call(attendantA, "GET", `/verify/${over.token}`)).body.timing, "over");
  assert.equal((await call(attendantA, "POST", "/visits", { qr_token: over.token })).status, 409);
});

test("attendants never receive amounts, prices or revenue", async () => {
  const { token } = await paidBooking(spaceA, 5);
  await call(attendantA, "POST", "/visits", { qr_token: token });

  for (const path of [`/verify/${token}`, "/gate/home", "/visits"]) {
    const res = await call(attendantA, "GET", path);
    assert.equal(res.status, 200, path);
    assert.doesNotMatch(JSON.stringify(res.body), /amount|price|revenue/i, path);
  }
  // The owner still sees the amount on the same booking.
  assert.equal((await call(owner, "GET", `/verify/${token}`)).body.booking.amount, 80);

  // Money and customer endpoints are closed to attendants.
  for (const path of ["/owner/stats", "/owner/bookings", "/owner/spaces", "/bookings", `/spaces/${spaceA}`]) {
    assert.equal((await call(attendantA, "GET", path)).status, 403, path);
  }
});

test("customers and anonymous visitors cannot use gate endpoints", async () => {
  const { token } = await paidBooking(spaceA, 5);
  for (const [session, status] of [[customer, 403], [null, 401]] as const) {
    assert.equal((await call(session, "GET", `/verify/${token}`)).status, status);
    assert.equal((await call(session, "GET", "/gate/home")).status, status);
    assert.equal((await call(session, "GET", "/gate/lookup?reference=PSZ-1")).status, status);
    assert.equal((await call(session, "GET", "/visits")).status, status);
    assert.equal((await call(session, "POST", "/visits", { qr_token: token })).status, status);
    assert.equal((await call(session, "POST", "/visits/1/exit")).status, status);
    assert.equal((await rawCall(session, "PUT", "/visits/1/photo", PNG)).status, status);
  }
});

test("a removed attendant can no longer log in or use an old session", async () => {
  const temp = await createAttendant(spaceA, "gate_attendant_temp");
  assert.equal((await call(temp, "GET", "/gate/home")).status, 200);
  const { token } = await paidBooking(spaceA, 5);

  const list = await call(owner, "GET", `/owner/spaces/${spaceA}/attendants`);
  const tempId = list.body.attendants.find((a: { username: string }) => a.username === "gate_attendant_temp").id;
  assert.equal((await call(otherOwner, "DELETE", `/owner/spaces/${spaceA}/attendants/${tempId}`)).status, 404);
  assert.equal((await call(owner, "DELETE", `/owner/spaces/${spaceA}/attendants/${tempId}`)).status, 200);

  const loginAgain = await call(null, "POST", "/auth/login", {
    username: "gate_attendant_temp",
    password: "test-password",
  });
  assert.equal(loginAgain.status, 401);
  // The session cookie issued before removal is useless too.
  assert.equal((await call(temp, "GET", "/auth/me")).status, 401);
  assert.equal((await call(temp, "GET", "/gate/home")).status, 403);
  assert.deepEqual((await call(temp, "GET", `/verify/${token}`)).body, { valid: false });
  assert.equal((await call(temp, "POST", "/visits", { qr_token: token })).status, 404);
});
