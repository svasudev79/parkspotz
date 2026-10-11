// API tests for the two booking rules most likely to break silently:
// the last-slot race and the overlap rule (Solution-outline.md section 8.4).
//
// They run the real Express app against the TEST database only:
//   TEST_DATABASE_URL, or DATABASE_URL with the database name + "_test".
import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const url = new URL(process.env.DATABASE_URL ?? "postgres://parkspotz@127.0.0.1:5433/parkspotz");
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

// Point the app at the test database before any app code is loaded.
const databaseUrl = testDatabaseUrl();
if (!new URL(databaseUrl).pathname.endsWith("_test")) {
  throw new Error(`Refusing to run tests: database "${new URL(databaseUrl).pathname}" does not end in _test`);
}
process.env.DATABASE_URL = databaseUrl;
process.env.PAYMENT_MODE = "mock";
process.env.JWT_SECRET ??= "test-only-secret";

let baseUrl = "";
let stop: () => Promise<void> = async () => {};

interface Session {
  cookie: string;
}

async function call(session: Session | null, method: string, path: string, body?: unknown) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(session ? { cookie: session.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: res.status, body: await res.json(), setCookie: res.headers.get("set-cookie") };
}

async function signup(username: string, role: "driver" | "owner"): Promise<Session> {
  const res = await call(null, "POST", "/auth/signup", { username, password: "test-password", role });
  assert.equal(res.status, 201);
  return { cookie: res.setCookie!.split(";")[0]! };
}

async function createSpace(owner: Session, totalSlots: number): Promise<number> {
  const res = await call(owner, "POST", "/spaces", {
    name: `Test space with ${totalSlots} slot(s)`,
    address: "Test address",
    lat: 12.9755,
    lng: 77.6068,
    space_type: "surface",
    ownership: "private",
    total_slots: totalSlots,
    price_per_hour: 40,
    open_time: "08:00",
    close_time: "22:00",
  });
  assert.equal(res.status, 201);
  return res.body.space.id;
}

// An IST time on a future day, as an ISO string. Day 1 is tomorrow.
function ist(daysAhead: number, time: string): string {
  const day = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(day);
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}

async function slotsAvailable(driver: Session, spaceId: number, start: string, end: string): Promise<number> {
  const query = new URLSearchParams({ lat: "12.9755", lng: "77.6068", radius: "500", start, end });
  const res = await call(driver, "GET", `/spaces?${query}`);
  assert.equal(res.status, 200);
  return res.body.spaces.find((space: { id: number }) => space.id === spaceId).slots_available;
}

let owner: Session;
let driverA: Session;
let driverB: Session;

before(async () => {
  const { pool } = await import("../src/db");
  const { app } = await import("../src/app");
  await pool.query(readFileSync("schema.sql", "utf8"));
  await pool.query("TRUNCATE users, parking_spaces, bookings, payments RESTART IDENTITY CASCADE");

  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
  };

  owner = await signup("test_owner", "owner");
  driverA = await signup("test_driver_a", "driver");
  driverB = await signup("test_driver_b", "driver");
});

after(() => stop());

test("last slot: two drivers booking the same window at once — exactly one succeeds", async () => {
  const spaceId = await createSpace(owner, 1);

  for (let round = 1; round <= 5; round++) {
    const window = { space_id: spaceId, start: ist(round, "10:00"), end: ist(round, "12:00") };
    const results = await Promise.all([
      call(driverA, "POST", "/bookings", window),
      call(driverB, "POST", "/bookings", window),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [201, 409], `round ${round}: expected one 201 and one 409`);
    assert.equal(await slotsAvailable(driverA, spaceId, window.start, window.end), 0);
  }
});

test("last slot: with two slots, the third booking for a window is refused", async () => {
  const spaceId = await createSpace(owner, 2);
  const window = { space_id: spaceId, start: ist(1, "10:00"), end: ist(1, "12:00") };

  assert.equal((await call(driverA, "POST", "/bookings", window)).status, 201);
  assert.equal((await call(driverB, "POST", "/bookings", window)).status, 201);
  assert.equal((await call(driverA, "POST", "/bookings", window)).status, 409);
});

test("overlap: 10:00-12:00 booked — 11:00-13:00 is refused, 12:00-14:00 is free", async () => {
  const spaceId = await createSpace(owner, 1);
  const day = 2;

  const booked = await call(driverA, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "10:00"),
    end: ist(day, "12:00"),
  });
  assert.equal(booked.status, 201);
  assert.equal(booked.body.booking.amount, 80); // 2 hours at 40 per hour
  const confirmed = await call(driverA, "POST", `/bookings/${booked.body.booking.id}/confirm`, {
    mock_payment_id: "mock_pay_test",
  });
  assert.equal(confirmed.body.booking.status, "confirmed");

  // Search: an overlapping window shows no slots, an adjacent one shows the slot.
  assert.equal(await slotsAvailable(driverB, spaceId, ist(day, "11:00"), ist(day, "13:00")), 0);
  assert.equal(await slotsAvailable(driverB, spaceId, ist(day, "12:00"), ist(day, "14:00")), 1);
  assert.equal(await slotsAvailable(driverB, spaceId, ist(day, "08:00"), ist(day, "10:00")), 1);

  // Booking follows the same rule.
  const overlapping = await call(driverB, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "11:00"),
    end: ist(day, "13:00"),
  });
  assert.equal(overlapping.status, 409);
  const adjacent = await call(driverB, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "12:00"),
    end: ist(day, "14:00"),
  });
  assert.equal(adjacent.status, 201);
});

test("a cancelled (failed payment) booking frees its slot", async () => {
  const spaceId = await createSpace(owner, 1);
  const window = { space_id: spaceId, start: ist(3, "10:00"), end: ist(3, "12:00") };

  const held = await call(driverA, "POST", "/bookings", window);
  assert.equal(held.status, 201);
  assert.equal((await call(driverB, "POST", "/bookings", window)).status, 409);

  await call(driverA, "POST", `/bookings/${held.body.booking.id}/fail`);
  assert.equal((await call(driverB, "POST", "/bookings", window)).status, 201);
});
