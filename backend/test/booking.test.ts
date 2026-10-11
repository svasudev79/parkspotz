// API tests for the two booking rules most likely to break silently:
// the last-slot race and the overlap rule (Solution-outline.md section 8.4).
//
// They run the real Express app against the TEST database only:
//   TEST_DATABASE_URL, or DATABASE_URL with the database name + "_test".
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { call, createSpace, ist, signup, startApp, type Session } from "./helpers";

async function slotsAvailable(customer: Session, spaceId: number, start: string, end: string): Promise<number> {
  const query = new URLSearchParams({ lat: "12.9755", lng: "77.6068", radius: "500", start, end });
  const res = await call(customer, "GET", `/spaces?${query}`);
  assert.equal(res.status, 200);
  return res.body.spaces.find((space: { id: number }) => space.id === spaceId).slots_available;
}

let owner: Session;
let customerA: Session;
let customerB: Session;
let stop: () => Promise<void> = async () => {};

before(async () => {
  ({ stop } = await startApp());
  owner = await signup("test_owner", "owner");
  customerA = await signup("test_customer_a", "customer");
  customerB = await signup("test_customer_b", "customer");
});

after(() => stop());

test("last slot: two customers booking the same window at once — exactly one succeeds", async () => {
  const spaceId = await createSpace(owner, 1);

  for (let round = 1; round <= 5; round++) {
    const window = { space_id: spaceId, start: ist(round, "10:00"), end: ist(round, "12:00") };
    const results = await Promise.all([
      call(customerA, "POST", "/bookings", window),
      call(customerB, "POST", "/bookings", window),
    ]);
    const statuses = results.map((result) => result.status).sort();
    assert.deepEqual(statuses, [201, 409], `round ${round}: expected one 201 and one 409`);
    assert.equal(await slotsAvailable(customerA, spaceId, window.start, window.end), 0);
  }
});

test("last slot: with two slots, the third booking for a window is refused", async () => {
  const spaceId = await createSpace(owner, 2);
  const window = { space_id: spaceId, start: ist(1, "10:00"), end: ist(1, "12:00") };

  assert.equal((await call(customerA, "POST", "/bookings", window)).status, 201);
  assert.equal((await call(customerB, "POST", "/bookings", window)).status, 201);
  assert.equal((await call(customerA, "POST", "/bookings", window)).status, 409);
});

test("overlap: 10:00-12:00 booked — 11:00-13:00 is refused, 12:00-14:00 is free", async () => {
  const spaceId = await createSpace(owner, 1);
  const day = 2;

  const booked = await call(customerA, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "10:00"),
    end: ist(day, "12:00"),
  });
  assert.equal(booked.status, 201);
  assert.equal(booked.body.booking.amount, 80); // 2 hours at 40 per hour
  const confirmed = await call(customerA, "POST", `/bookings/${booked.body.booking.id}/confirm`, {
    mock_payment_id: "mock_pay_test",
  });
  assert.equal(confirmed.body.booking.status, "confirmed");

  // Search: an overlapping window shows no slots, an adjacent one shows the slot.
  assert.equal(await slotsAvailable(customerB, spaceId, ist(day, "11:00"), ist(day, "13:00")), 0);
  assert.equal(await slotsAvailable(customerB, spaceId, ist(day, "12:00"), ist(day, "14:00")), 1);
  assert.equal(await slotsAvailable(customerB, spaceId, ist(day, "08:00"), ist(day, "10:00")), 1);

  // Booking follows the same rule.
  const overlapping = await call(customerB, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "11:00"),
    end: ist(day, "13:00"),
  });
  assert.equal(overlapping.status, 409);
  const adjacent = await call(customerB, "POST", "/bookings", {
    space_id: spaceId,
    start: ist(day, "12:00"),
    end: ist(day, "14:00"),
  });
  assert.equal(adjacent.status, 201);
});

test("a cancelled (failed payment) booking frees its slot", async () => {
  const spaceId = await createSpace(owner, 1);
  const window = { space_id: spaceId, start: ist(3, "10:00"), end: ist(3, "12:00") };

  const held = await call(customerA, "POST", "/bookings", window);
  assert.equal(held.status, 201);
  assert.equal((await call(customerB, "POST", "/bookings", window)).status, 409);

  await call(customerA, "POST", `/bookings/${held.body.booking.id}/fail`);
  assert.equal((await call(customerB, "POST", "/bookings", window)).status, 201);
});
