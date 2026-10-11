// API tests for guest mode: searching, booking and paying without an account.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import bcrypt from "bcryptjs";
import { call, createSpace, ist, login, pool, signup, startApp, type Session } from "./helpers";

let owner: Session;
let customer: Session;
let attendant: Session;
let admin: Session;
let space: number; // 5 slots, 40 per hour, open 08:00-22:00
let nextIp = 1;
let stop: () => Promise<void> = async () => {};

const GUEST = { name: "Asha Rao", phone: "9876543210" };

// A fresh guest: its own browser (cookie jar) and its own IP address.
interface Guest {
  cookie: string;
  headers: Record<string, string>;
}
function newGuest(): Guest {
  return { cookie: "", headers: { "X-Forwarded-For": `203.0.113.${nextIp++}` } };
}

async function guestCall(guest: Guest, method: string, path: string, body?: unknown) {
  const res = await call(guest.cookie ? { cookie: guest.cookie } : null, method, path, body, guest.headers);
  const jar = res.cookies.find((cookie) => cookie.startsWith("parkspotz_guest="));
  if (jar !== undefined) guest.cookie = jar === "parkspotz_guest=" ? "" : jar;
  return res;
}

// A window on its own day, so tests do not compete for slots.
let nextDay = 1;
function freshWindow(spaceId = space) {
  const day = nextDay++;
  return { space_id: spaceId, start: ist(day, "10:00"), end: ist(day, "12:00") };
}

// Books as a guest. Each call uses a new mobile number unless `extra.phone`
// says otherwise, because unpaid holds are also limited per number.
let nextPhone = 0;
async function guestBooks(guest: Guest, extra: Record<string, unknown> = {}) {
  const phone = `98${String(10000000 + nextPhone++)}`;
  return guestCall(guest, "POST", "/guest/bookings", { ...freshWindow(), name: GUEST.name, phone, ...extra });
}

before(async () => {
  ({ stop } = await startApp());
  owner = await signup("guest_test_owner", "owner");
  customer = await signup("guest_test_customer", "customer");
  space = await createSpace(owner, 5, "Guest test space");
  await call(owner, "POST", `/owner/spaces/${space}/attendants`, { username: "guest_test_attendant", password: "test-password" });
  attendant = await login("guest_test_attendant");
  await pool.query("INSERT INTO users (username, password_hash, role) VALUES ('guest_test_admin', $1, 'admin')", [
    await bcrypt.hash("test-password", 4),
  ]);
  admin = await login("guest_test_admin");
});

after(() => stop());

test("anonymous visitors can search and open a space; private APIs still need a login", async () => {
  const query = new URLSearchParams({ lat: "12.9755", lng: "77.6068", radius: "500", start: ist(1, "10:00"), end: ist(1, "12:00") });
  const search = await call(null, "GET", `/spaces?${query}`);
  assert.equal(search.status, 200);
  const found = search.body.spaces.find((s: { id: number }) => s.id === space);
  assert.equal(found.slots_available, 5);
  // Nothing owner-private in what the public gets.
  assert.deepEqual(
    Object.keys(found).sort(),
    ["address", "close_time", "distance_m", "id", "is_active", "is_open", "lat", "lng", "name", "open_time",
     "ownership", "price_per_hour", "slots_available", "space_type", "total_slots"]
  );
  const one = await call(null, "GET", `/spaces/${space}`);
  assert.equal(one.status, 200);
  assert.equal("owner_id" in one.body.space, false);
  // The owner still gets their own id back, to manage the space.
  assert.equal((await call(owner, "GET", `/spaces/${space}`)).body.space.owner_id > 0, true);

  // An unlisted space is invisible to the public.
  const hidden = await createSpace(owner, 1, "Hidden space");
  await call(owner, "PATCH", `/spaces/${hidden}`, { is_active: false });
  assert.equal((await call(null, "GET", `/spaces/${hidden}`)).status, 404);

  for (const path of ["/bookings", "/owner/spaces", "/owner/stats", "/owner/rental", "/gate/home", "/visits", "/admin/dashboard", "/admin/spaces", "/auth/me"]) {
    assert.equal((await call(null, "GET", path)).status, 401, path);
  }
  assert.equal((await call(null, "POST", "/spaces", {})).status, 401);
  assert.equal((await call(null, "POST", "/bookings", freshWindow())).status, 401);
});

test("a guest can book, pay and read the receipt with the token; without it the booking is 404", async () => {
  const guest = newGuest();
  const booked = await guestBooks(guest, { phone: "+91 98765-43210", name: "  Asha   Rao " });
  assert.equal(booked.status, 201);
  const { booking } = booked.body;
  assert.equal(booking.status, "pending");
  assert.equal(booking.amount, 80); // worked out by the server: 2 hours at 40
  assert.equal(booking.guest_name, "Asha Rao");
  assert.equal(booking.guest_phone, "9876543210");
  assert.match(booking.access_token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(booking.verify_url, null);
  assert.ok(guest.cookie.startsWith("parkspotz_guest="));
  const token: string = booking.access_token;

  const paid = await call(null, "POST", `/guest/bookings/${token}/confirm`, { mock_payment_id: "mock_pay_guest" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.booking.status, "confirmed");
  // Confirming again changes nothing.
  assert.equal((await call(null, "POST", `/guest/bookings/${token}/confirm`, { mock_payment_id: "mock_pay_again" })).body.booking.status, "confirmed");

  // The receipt link works with no cookie at all, from any device.
  const receipt = await call(null, "GET", `/guest/bookings/${token}`);
  assert.equal(receipt.status, 200);
  assert.match(receipt.body.booking.verify_url, /\/verify\/[A-Za-z0-9_-]+$/);
  assert.equal(receipt.body.booking.reference, `PSZ-${String(booking.id).padStart(6, "0")}`);
  // The browser that booked sees it under its guest bookings.
  const mine = await guestCall(guest, "GET", "/guest/bookings");
  assert.deepEqual(mine.body.bookings.map((b: { id: number }) => b.id), [booking.id]);

  // Without the token there is no way in: not by id, not with a wrong token.
  assert.equal((await call(null, "GET", `/bookings/${booking.id}`)).status, 401);
  assert.equal((await call(customer, "GET", `/bookings/${booking.id}`)).status, 404);
  assert.equal((await call(null, "GET", `/guest/bookings/${booking.id}`)).status, 404);
  assert.equal((await call(null, "GET", `/guest/bookings/${token.slice(0, -1)}x`)).status, 404);
  assert.equal((await call(null, "GET", "/guest/bookings")).body.bookings.length, 0);
});

test("one guest cannot read, pay or cancel another guest's or a customer's booking", async () => {
  const guestA = newGuest();
  const guestB = newGuest();
  const a = (await guestBooks(guestA)).body.booking;
  const b = (await guestBooks(guestB)).body.booking;

  // Guest A's browser only ever lists A's booking, and B's id is useless.
  assert.deepEqual((await guestCall(guestA, "GET", "/guest/bookings")).body.bookings.map((x: { id: number }) => x.id), [a.id]);
  for (const path of [`/guest/bookings/${b.id}`, `/guest/bookings/PSZ-${b.id}`, `/guest/bookings/${b.reference}`]) {
    assert.equal((await guestCall(guestA, "GET", path)).status, 404, path);
  }
  assert.equal((await guestCall(guestA, "POST", `/guest/bookings/${b.id}/confirm`, { mock_payment_id: "mock_pay_x" })).status, 404);
  assert.equal((await guestCall(guestA, "POST", `/guest/bookings/${b.id}/fail`)).status, 404);
  // A cookie that was tampered with is ignored.
  const forged = { cookie: guestA.cookie.slice(0, -3) + "abc", headers: guestA.headers };
  assert.equal((await guestCall(forged, "GET", "/guest/bookings")).body.bookings.length, 0);

  // A customer's booking has no guest token and cannot be reached as a guest.
  const mine = await call(customer, "POST", "/bookings", freshWindow());
  assert.equal(mine.status, 201);
  assert.equal("access_token" in mine.body.booking, false);
  assert.equal((await guestCall(guestA, "GET", `/guest/bookings/${mine.body.booking.id}`)).status, 404);
  assert.equal((await guestCall(guestA, "POST", `/guest/bookings/${mine.body.booking.id}/fail`)).status, 404);
  // And a customer cannot reach a guest's booking through the customer API.
  assert.equal((await call(customer, "POST", `/bookings/${b.id}/confirm`, { mock_payment_id: "mock_pay_x" })).status, 404);
  assert.equal((await call(customer, "POST", `/bookings/${b.id}/fail`)).status, 404);

  const { rows } = await pool.query("SELECT id, status FROM bookings WHERE id = ANY($1) ORDER BY id", [[a.id, b.id, mine.body.booking.id]]);
  assert.ok(rows.every((row) => row.status === "pending"));
});

test("guest name and phone are validated; +91 and 0 prefixes are removed", async () => {
  const good: [string, string][] = [
    ["9876543210", "9876543210"], ["+919876543210", "9876543210"], ["91 98765 43210", "9876543210"],
    ["098765-43210", "9876543210"], ["6000000000", "6000000000"],
  ];
  for (const [input, stored] of good) {
    const res = await guestBooks(newGuest(), { phone: input });
    assert.equal(res.status, 201, input);
    assert.equal(res.body.booking.guest_phone, stored, input);
    // Release the hold, so the limit per mobile number does not get in the way.
    await call(null, "POST", `/guest/bookings/${res.body.booking.access_token}/fail`);
  }
  for (const phone of ["", "12345", "5876543210", "98765432101", "98765abcde", "+449876543210", 9876543210, null]) {
    const res = await guestBooks(newGuest(), { phone });
    assert.equal(res.status, 400, `phone ${phone}`);
  }
  for (const name of ["", "A", " ", "x".repeat(61), 42, null]) {
    const res = await guestBooks(newGuest(), { name });
    assert.equal(res.status, 400, `name ${name}`);
  }
  assert.equal((await guestBooks(newGuest(), { name: "Li" })).status, 201);
});

test("unpaid holds are limited to 2 per guest browser and per IP (429), and free up when paid, cancelled or expired", async () => {
  // Per browser: the same cookie from different addresses.
  const guest = newGuest();
  const first = await guestBooks(guest);
  guest.headers = newGuest().headers;
  const second = await guestBooks(guest);
  assert.deepEqual([first.status, second.status], [201, 201]);
  guest.headers = newGuest().headers;
  const third = await guestBooks(guest);
  assert.equal(third.status, 429);
  assert.match(third.body.error, /unpaid bookings/);

  // Paying one frees a place.
  await guestCall(guest, "POST", `/guest/bookings/${first.body.booking.access_token}/confirm`, { mock_payment_id: "mock_pay_1" });
  const fourth = await guestBooks(guest);
  assert.equal(fourth.status, 201);
  assert.equal((await guestBooks(guest)).status, 429);
  // Cancelling one (failed payment) frees a place.
  await guestCall(guest, "POST", `/guest/bookings/${second.body.booking.access_token}/fail`);
  const fifth = await guestBooks(guest);
  assert.equal(fifth.status, 201);
  assert.equal((await guestBooks(guest)).status, 429);
  // An expired hold frees a place.
  await pool.query("UPDATE bookings SET created_at = now() - interval '11 minutes' WHERE id = $1", [fourth.body.booking.id]);
  assert.equal((await guestBooks(guest)).status, 201);

  // Per IP: different browsers (no shared cookie) behind one address.
  const address = newGuest().headers;
  assert.equal((await guestBooks({ cookie: "", headers: address })).status, 201);
  assert.equal((await guestBooks({ cookie: "", headers: address })).status, 201);
  assert.equal((await guestBooks({ cookie: "", headers: address })).status, 429);
  // A spoofed left-hand X-Forwarded-For entry does not get around it: only
  // the entry added by the proxy in front of the API (the last one) counts.
  const spoofed = { "X-Forwarded-For": `198.51.100.77, ${address["X-Forwarded-For"]}` };
  assert.equal((await guestBooks({ cookie: "", headers: spoofed })).status, 429);
  // Another address is unaffected, and so are logged-in customers.
  assert.equal((await guestBooks(newGuest())).status, 201);
  for (let i = 0; i < 3; i++) {
    assert.equal((await call(customer, "POST", "/bookings", freshWindow(), address)).status, 201);
  }
});

test("unpaid holds are also limited to 2 per mobile number, whatever the browser or IP", async () => {
  const phone = "9123456780";
  // Three different browsers at three different addresses, one phone number.
  const first = await guestBooks(newGuest(), { phone });
  const second = await guestBooks(newGuest(), { phone: `+91 ${phone}` });
  assert.deepEqual([first.status, second.status], [201, 201]);
  const third = await guestBooks(newGuest(), { phone: `0${phone}` });
  assert.equal(third.status, 429);
  assert.match(third.body.error, /mobile number/);
  // Another number is fine, and paying frees a place for this one.
  assert.equal((await guestBooks(newGuest(), { phone: "9123456781" })).status, 201);
  await call(null, "POST", `/guest/bookings/${first.body.booking.access_token}/confirm`, { mock_payment_id: "mock_pay_p" });
  assert.equal((await guestBooks(newGuest(), { phone })).status, 201);
});

test("logging in or signing up as a customer moves the browser's guest bookings to that account", async () => {
  const guest = newGuest();
  const one = (await guestBooks(guest)).body.booking;
  await guestCall(guest, "POST", `/guest/bookings/${one.access_token}/confirm`, { mock_payment_id: "mock_pay_c" });
  const two = (await guestBooks(guest)).body.booking;

  // Logging in as an owner on that browser does not take them.
  const asOwner = await call({ cookie: guest.cookie }, "POST", "/auth/login", { username: "guest_test_owner", password: "test-password" });
  assert.equal(asOwner.status, 200);
  assert.equal(asOwner.cookies.some((c) => c.startsWith("parkspotz_guest=")), false);
  assert.equal((await guestCall(guest, "GET", "/guest/bookings")).body.bookings.length, 2);

  // Signing up as a customer does, and clears the guest cookie.
  const signedUp = await call({ cookie: guest.cookie }, "POST", "/auth/signup", {
    username: "guest_turned_customer", password: "test-password", role: "customer",
  });
  assert.equal(signedUp.status, 201);
  assert.ok(signedUp.cookies.includes("parkspotz_guest="), "guest cookie is cleared");
  const account = { cookie: signedUp.setCookie! };
  const mine = await call(account, "GET", "/bookings");
  assert.deepEqual(mine.body.bookings.map((b: { id: number }) => b.id).sort(), [one.id, two.id].sort());
  assert.equal((await call(account, "GET", `/bookings/${one.id}`)).body.booking.status, "confirmed");
  // The old guest cookie now lists nothing; the saved receipt link still works.
  assert.equal((await guestCall(guest, "GET", "/guest/bookings")).body.bookings.length, 0);
  assert.equal((await call(null, "GET", `/guest/bookings/${one.access_token}`)).status, 200);
  // The pending one can now be paid from the account.
  assert.equal((await call(account, "POST", `/bookings/${two.id}/confirm`, { mock_payment_id: "mock_pay_d" })).body.booking.status, "confirmed");

  // Logging in (rather than signing up) claims too.
  const again = newGuest();
  const three = (await guestBooks(again)).body.booking;
  const loggedIn = await call({ cookie: again.cookie }, "POST", "/auth/login", { username: "guest_turned_customer", password: "test-password" });
  assert.equal(loggedIn.status, 200);
  assert.ok((await call({ cookie: loggedIn.setCookie! }, "GET", "/bookings")).body.bookings.some((b: { id: number }) => b.id === three.id));
});

test("last slot: a guest and a customer booking the same window at once — exactly one succeeds", async () => {
  const single = await createSpace(owner, 1, "One slot, guests welcome");
  for (let round = 0; round < 5; round++) {
    const window = freshWindow(single);
    const results = await Promise.all([
      call(customer, "POST", "/bookings", window),
      guestBooks(newGuest(), window),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409], `round ${round}`);
    const { rows } = await pool.query("SELECT count(*)::int AS n FROM bookings WHERE space_id = $1 AND start_time = $2", [single, window.start]);
    assert.equal(rows[0].n, 1);
  }
});

test("gate staff see a guest's name and tag everywhere, the phone only on the check screen; the admin sees counts only", async () => {
  const guest = newGuest();
  const booking = (await guestBooks(guest, { phone: GUEST.phone })).body.booking;
  await guestCall(guest, "POST", `/guest/bookings/${booking.access_token}/confirm`, { mock_payment_id: "mock_pay_g" });
  // Make the booking current so entry can be recorded.
  const { rows } = await pool.query(
    "UPDATE bookings SET start_time = now() - interval '5 minutes', end_time = now() + interval '115 minutes' WHERE id = $1 RETURNING qr_token",
    [booking.id]
  );
  const qr: string = rows[0].qr_token;

  const expected = await call(attendant, "GET", "/gate/home");
  const row = expected.body.expected.find((b: { reference: string }) => b.reference === booking.reference);
  assert.deepEqual([row.customer, row.is_guest], ["Asha Rao", true]);
  assert.doesNotMatch(JSON.stringify(expected.body), /9876543210/);

  const check = await call(attendant, "GET", `/verify/${qr}`);
  assert.deepEqual(
    [check.body.booking.customer, check.body.booking.is_guest, check.body.booking.guest_phone],
    ["Asha Rao", true, "9876543210"]
  );
  assert.equal("amount" in check.body.booking, false);

  const entry = await call(attendant, "POST", "/visits", { qr_token: qr, vehicle_number: "KA01G1234" });
  assert.equal(entry.status, 201);
  const visitId: number = entry.body.visit.id;
  assert.equal((await call(attendant, "GET", `/visits/${visitId}`)).body.visit.guest_phone, "9876543210");
  // Lists never carry the phone number.
  for (const path of ["/gate/home", "/visits"]) {
    const list = await call(attendant, "GET", path);
    assert.match(JSON.stringify(list.body), /Asha Rao/, path);
    assert.doesNotMatch(JSON.stringify(list.body), /9876543210|guest_phone/, path);
  }
  const today = await call(owner, "GET", "/owner/bookings");
  assert.ok(today.body.bookings.some((b: { customer: string; is_guest: boolean }) => b.customer === "Asha Rao" && b.is_guest));
  assert.doesNotMatch(JSON.stringify(today.body), /9876543210/);

  // Exit and overstay work as for any booking, and the guest's receipt shows the visit.
  assert.equal((await call(attendant, "POST", `/visits/${visitId}/exit`)).status, 200);
  const receipt = await call(null, "GET", `/guest/bookings/${booking.access_token}`);
  assert.ok(receipt.body.booking.visit.exit_at);

  // Another space's staff get nothing about this guest.
  const otherOwner = await signup("guest_test_other_owner", "owner");
  assert.deepEqual((await call(otherOwner, "GET", `/verify/${qr}`)).body, { valid: false });

  // The admin sees how many bookings came from guests, and no guest details.
  const dashboard = await call(admin, "GET", "/admin/dashboard");
  const month = dashboard.body.bookings.month;
  assert.ok(month.guest >= 1);
  assert.equal(month.guest + month.registered, month.count);
  for (const path of ["/admin/dashboard", "/admin/spaces", "/admin/rental"]) {
    assert.doesNotMatch(JSON.stringify((await call(admin, "GET", path)).body), /9876543210|Asha Rao|guest_phone/, path);
  }
});
