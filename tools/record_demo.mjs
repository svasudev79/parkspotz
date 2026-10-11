// Records the ParkSpotZ walkthrough video (see demo/README.md).
//
// It drives a LOCAL copy of the app in Google Chrome and records five short
// chapters: a guest booking, the gate attendant, a customer, an owner and the
// admin. It needs a throwaway database, because it creates bookings and
// changes their times with SQL to show an overstay.
//
// Before running it:
//   1. Create a throwaway database, e.g. `parkspotz_video`, and run db:setup,
//      db:seed and admin:create against it (see README.md).
//   2. Start the API against that database with PAYMENT_MODE=mock, and the
//      frontend (a production build, `next build && next start`, so that no
//      development overlay shows) on http://localhost:3000.
//   3. In a folder OUTSIDE this repo: `npm install playwright-core ffmpeg-static`.
//      Google Chrome must be installed; no browser is downloaded.
//   4. Playwright's video recorder looks for its own ffmpeg. Either run
//      `npx playwright install ffmpeg`, or reuse ffmpeg-static without any
//      download: make a folder with `ffmpeg-1013/ffmpeg-mac` in it that is a
//      link to node_modules/ffmpeg-static/ffmpeg, and set
//      PLAYWRIGHT_BROWSERS_PATH to that folder. (The error message printed
//      when it is missing shows the exact file name it wants.)
//
// Run it from the repo root:
//   PLAYWRIGHT_DIR=<that folder> \
//   DATABASE_URL=postgres://parkspotz@127.0.0.1:5433/parkspotz_video \
//   ADMIN_USERNAME=admin ADMIN_PASSWORD=<the throwaway admin password> \
//   node tools/record_demo.mjs
//
// Settings (all from the environment; no password is written in this file
// except the public local demo password):
//   PLAYWRIGHT_DIR   folder holding node_modules/playwright-core (required)
//   DATABASE_URL     the throwaway database; its name must end in "_video"
//   ADMIN_USERNAME, ADMIN_PASSWORD   the admin login of that database
//   DEMO_PASSWORD    password of the demo accounts (default: parkspotz-demo)
//   BASE_URL         the site to record (default: http://localhost:3000)
//   OUT_DIR          where the video goes (default: demo)
//   FRAMES_DIR       if set, still screenshots of key moments are saved there
//
// Output: OUT_DIR/parkspotz-walkthrough.mp4 (all chapters joined) when
// ffmpeg-static is installed in PLAYWRIGHT_DIR, and always the five clips
// OUT_DIR/clip-N-*.webm. It also prints where each chapter starts.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const OUT = resolve(repoRoot, process.env.OUT_DIR ?? "demo");
const FRAMES = process.env.FRAMES_DIR ? resolve(process.env.FRAMES_DIR) : null;
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || "parkspotz-demo";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL = process.env.DATABASE_URL ?? "";

if (!process.env.PLAYWRIGHT_DIR) throw new Error("Set PLAYWRIGHT_DIR (see the top of this file)");
if (!ADMIN_PASSWORD) throw new Error("Set ADMIN_PASSWORD to the throwaway database's admin password");
if (!/\/[A-Za-z0-9_]*_video(\?|$)/.test(DATABASE_URL)) {
  throw new Error('DATABASE_URL must point at a throwaway database whose name ends in "_video"');
}
if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(BASE)) {
  throw new Error("BASE_URL must be a local address; this script is not for a live site");
}

const toolRequire = createRequire(join(resolve(process.env.PLAYWRIGHT_DIR), "package.json"));
const { chromium } = toolRequire("playwright-core");
const { Client } = createRequire(join(repoRoot, "backend", "package.json"))("pg");
let ffmpeg = null;
try {
  ffmpeg = toolRequire("ffmpeg-static");
} catch {
  ffmpeg = null;
}

// The recorder captures at CSS-pixel size, so the video size equals the viewport.
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, video: { width: 390, height: 844 } };
const DESKTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, video: { width: 1280, height: 800 } };
const IST = "Asia/Kolkata";

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const db = new Client({ connectionString: DATABASE_URL });

// --- small helpers for a watchable recording ---------------------------------

// A caption bar at the bottom of the page. It is put back after every page load.
function showCaption(text) {
  let bar = document.getElementById("psz-caption");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "psz-caption";
    bar.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:2147483647;pointer-events:none;" +
      "background:rgba(15,23,42,.94);color:#fff;font:600 15px/1.3 system-ui,sans-serif;" +
      "padding:11px 14px;text-align:center;letter-spacing:.01em";
    document.documentElement.appendChild(bar);
    document.body.style.paddingBottom = "56px";
  }
  bar.textContent = text;
}

async function newChapter(browser, device, text) {
  const context = await browser.newContext({
    viewport: device.viewport,
    deviceScaleFactor: device.deviceScaleFactor,
    locale: "en-IN",
    timezoneId: IST,
    recordVideo: { dir: join(OUT, ".tmp"), size: device.video },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  const state = { text };
  page.on("load", () => page.evaluate(showCaption, state.text).catch(() => {}));
  const caption = async (next) => {
    state.text = next;
    await page.evaluate(showCaption, next).catch(() => {});
  };
  return { context, page, caption };
}

async function finishChapter({ context, page }, name) {
  const video = page.video();
  await context.close();
  const target = join(OUT, `${name}.webm`);
  renameSync(await video.path(), target);
  return target;
}

const pause = (page, ms = 2000) => page.waitForTimeout(ms);

async function frame(page, name) {
  if (FRAMES) await page.screenshot({ path: join(FRAMES, `${name}.png`) });
}

// Scrolls something into the middle of the screen, smoothly.
async function show(page, locator, ms = 1800) {
  await locator.first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(page, ms);
}

// A tap or click that the viewer can see: a dot appears where it lands.
async function tap(page, locator) {
  const target = locator.first();
  await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(page, 600);
  const box = await target.boundingBox();
  if (box) {
    await page.evaluate(
      ([x, y]) => {
        const dot = document.createElement("div");
        dot.style.cssText =
          `position:fixed;left:${x - 18}px;top:${y - 18}px;width:36px;height:36px;border-radius:50%;` +
          "background:rgba(5,150,105,.35);border:2px solid rgba(5,150,105,.9);z-index:2147483646;pointer-events:none";
        document.documentElement.appendChild(dot);
        setTimeout(() => dot.remove(), 700);
      },
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    await pause(page, 450);
  }
  await target.click();
}

async function type(page, locator, text) {
  await locator.first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(page, 400);
  await locator.first().click();
  await locator.first().pressSequentially(text, { delay: 70 });
  await pause(page, 500);
}

// Logs in on camera. The password goes into the masked field in one step.
async function login(page, username, password, landing) {
  await page.goto(`${BASE}/login`);
  await pause(page, 1200);
  await type(page, page.locator('input[name="username"]'), username);
  await page.locator('input[name="password"]').fill(password);
  await pause(page, 600);
  await tap(page, page.locator('form button[type="submit"]'));
  await page.waitForURL(`${BASE}${landing}`);
  await page.waitForLoadState("networkidle").catch(() => {});
}

function expectText(page, text) {
  return page.getByText(text).first().waitFor({ state: "visible" });
}

// IST wall-clock pieces for a moment `minutesAhead` from now.
function istParts(minutesAhead) {
  const when = new Date(Date.now() + minutesAhead * 60_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(when);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false }).format(when);
  return { date, time };
}

// --- things done off camera --------------------------------------------------

// A small made-up picture of a car, for the entry photo.
async function testPhoto(browser) {
  const page = await browser.newPage();
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 900;
    const g = c.getContext("2d");
    g.fillStyle = "#cbd5e1";
    g.fillRect(0, 0, 1200, 900);
    g.fillStyle = "#64748b";
    g.fillRect(0, 620, 1200, 280);
    g.fillStyle = "#1d4ed8";
    g.beginPath();
    g.roundRect(220, 380, 760, 240, 60);
    g.fill();
    g.beginPath();
    g.roundRect(380, 250, 440, 190, 50);
    g.fill();
    g.fillStyle = "#bfdbfe";
    g.fillRect(420, 285, 170, 110);
    g.fillRect(610, 285, 170, 110);
    g.fillStyle = "#0f172a";
    for (const x of [380, 820]) {
      g.beginPath();
      g.arc(x, 630, 80, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#fff";
    g.fillRect(500, 520, 200, 60);
    g.fillStyle = "#0f172a";
    g.font = "bold 34px sans-serif";
    g.fillText("KA01MJ2026", 508, 562);
    return c.toDataURL("image/jpeg", 0.9);
  });
  await page.close();
  return Buffer.from(dataUrl.split(",")[1], "base64");
}

// Calls the API as a logged-in user, without a browser.
async function apiSession(username, password) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`Could not log in as ${username}`);
  const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return async (method, path, body) => {
    const r = await fetch(`${BASE}/api${path}`, {
      method,
      headers: { cookie, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await r.json();
    if (!r.ok) throw new Error(`${method} ${path}: ${json.error}`);
    return json;
  };
}

// Gives demo_customer a finished visit with an overstay (for chapter 3), and
// one upcoming booking. The past visit is made by booking normally and then
// moving it into the past with SQL, since the app only books future times.
async function prepareCustomerHistory() {
  const customer = await apiSession("demo_customer", DEMO_PASSWORD);
  const space = (await db.query("SELECT id FROM parking_spaces WHERE name = 'Church Street Basement Parking'")).rows[0].id;
  const soon = new Date(Date.now() + 20 * 60_000);
  const past = await customer("POST", "/bookings", {
    space_id: space,
    start: soon.toISOString(),
    end: new Date(soon.getTime() + 2 * 3_600_000).toISOString(),
  });
  await customer("POST", `/bookings/${past.booking.id}/confirm`, { mock_payment_id: "mock_pay_demo1" });
  await db.query(
    `UPDATE bookings SET start_time = now() - interval '280 minutes', end_time = now() - interval '160 minutes' WHERE id = $1`,
    [past.booking.id]
  );
  // Entered five minutes after the start, left 40 minutes after the booked
  // end: two half-hour blocks at 50 per hour = 50, paid by UPI at the gate.
  await db.query(
    `INSERT INTO visits (space_id, booking_id, vehicle_number, entry_at, entry_by, exit_at, exit_by,
                         overstay_minutes, overstay_amount, overstay_settlement)
     SELECT $1, $2, 'KA 03 AB 4321', now() - interval '275 minutes', u.id, now() - interval '120 minutes', u.id, 40, 50, 'upi'
     FROM users u WHERE u.username = 'demo_owner'`,
    [space, past.booking.id]
  );

  const tomorrow = istParts(24 * 60).date;
  const start = new Date(`${tomorrow}T10:00:00+05:30`);
  const brigade = (await db.query("SELECT id FROM parking_spaces WHERE name = 'Brigade Road Multilevel Parking'")).rows[0].id;
  const next = await customer("POST", "/bookings", {
    space_id: brigade,
    start: start.toISOString(),
    end: new Date(start.getTime() + 3 * 3_600_000).toISOString(),
  });
  await customer("POST", `/bookings/${next.booking.id}/confirm`, { mock_payment_id: "mock_pay_demo2" });
}

// --- the chapters --------------------------------------------------------------

async function chapterGuest(browser) {
  const chapter = await newChapter(browser, PHONE, "1 · A guest books parking — no account needed");
  const { page, caption } = chapter;
  await page.goto(`${BASE}/`);
  await expectText(page, "Find parking");
  await pause(page, 2500);

  // Destination: Google Places search when the site has a Maps key, the
  // built-in landmark list otherwise.
  if ((await page.locator("gmp-place-autocomplete").count()) > 0) {
    await page.locator("gmp-place-autocomplete").click();
    await page.keyboard.type("Brigade Road Bengaluru", { delay: 80 });
    await pause(page, 2200);
    await page.keyboard.press("ArrowDown");
    await pause(page, 500);
    await page.keyboard.press("Enter");
    await expectText(page, /Searching near/);
  } else {
    await type(page, page.locator("input#destination"), "MG Road");
    await tap(page, page.getByRole("button", { name: "MG Road Metro" }));
  }
  await pause(page, 1500);

  // Today, starting in a few minutes, for two hours.
  const { date, time } = istParts(12);
  await show(page, page.locator('input[type="date"]'), 600);
  await page.locator('input[type="date"]').fill(date);
  await page.locator('input[type="time"]').fill(time);
  await pause(page, 1500);
  await tap(page, page.getByRole("button", { name: "Search parking" }));
  await expectText(page, /spaces? within/);
  await pause(page, 2500);
  await frame(page, "1a-results");
  const card = page.locator("section li", { hasText: "MG Road Metro Parking" });
  await show(page, card, 2500);

  await tap(page, card.getByRole("link", { name: "View details" }));
  await page.waitForURL(/\/spaces\/\d+/);
  await expectText(page, "Book this space");
  await pause(page, 2500);
  await tap(page, page.getByRole("button", { name: "Book", exact: true }));
  await caption("1 · Guests give a name and mobile number");
  await type(page, page.getByLabel("Your name"), "Priya Sharma");
  await type(page, page.getByLabel("Mobile number"), "98765 43210");
  await pause(page, 1500);
  await frame(page, "1b-guest-details");
  await tap(page, page.getByRole("button", { name: /^Confirm and pay/ }));

  await page.waitForURL(/\/receipt\/[^/]+\/pay$/);
  await caption("1 · Payment (test mode — no real money)");
  await expectText(page, /Test payment/i);
  await pause(page, 3000);
  await frame(page, "1c-payment");
  await tap(page, page.getByRole("button", { name: /^Pay ₹/ }));

  await page.waitForURL(/\/receipt\/[^/]+$/);
  await caption("1 · Receipt with a QR code, on a private link");
  await expectText(page, "Parking receipt");
  await pause(page, 3000);
  await frame(page, "1d-receipt-top");
  await show(page, page.locator("main img"), 3000);
  await frame(page, "1e-receipt-qr");
  const reference = (await page.getByText(/PSZ-\d{6}/).first().innerText()).match(/PSZ-\d{6}/)[0];
  await pause(page, 1000);
  return { clip: await finishChapter(chapter, "clip-1-guest-booking"), reference };
}

async function chapterAttendant(browser, reference, photo) {
  const chapter = await newChapter(browser, PHONE, "2 · The attendant at the gate");
  const { page, caption } = chapter;
  await login(page, "demo_attendant", DEMO_PASSWORD, "/attendant");
  await expectText(page, /Expected today/);
  await pause(page, 2500);
  await show(page, page.getByText(/Expected today/), 2500);
  await frame(page, "2a-gate");

  await caption("2 · Find the booking (or scan the receipt's QR code)");
  await type(page, page.getByPlaceholder("PSZ-000123"), reference);
  await tap(page, page.getByRole("button", { name: "Find booking" }));
  await page.waitForURL(/\/verify\//);
  await expectText(page, "Check booking");
  await pause(page, 3000);
  await frame(page, "2b-check");

  await caption("2 · Record entry, with the vehicle number and a photo");
  await type(page, page.getByPlaceholder("KA 01 AB 1234"), "KA 01 MJ 2026");
  await page.locator('main input[type="file"]').setInputFiles({ name: "car.jpg", mimeType: "image/jpeg", buffer: photo });
  await pause(page, 1800);
  await tap(page, page.getByRole("button", { name: "Record entry" }));
  await expectText(page, "Vehicle is inside");
  await pause(page, 2500);
  await show(page, page.getByText(/left · booked until/), 3000);
  await frame(page, "2c-inside");

  await tap(page, page.getByRole("link", { name: "Gate" }));
  await page.waitForURL(`${BASE}/attendant`);
  await expectText(page, "Inside now (1)");
  await caption("2 · Inside now, with the time left");
  await pause(page, 3500);
  await frame(page, "2d-inside-now");

  // Off camera: make the booking look as if it ended 50 minutes ago.
  const id = Number(reference.replace("PSZ-", ""));
  await db.query(
    "UPDATE bookings SET start_time = now() - interval '170 minutes', end_time = now() - interval '50 minutes' WHERE id = $1",
    [id]
  );
  await db.query("UPDATE visits SET entry_at = now() - interval '165 minutes' WHERE booking_id = $1", [id]);

  await caption("2 · Later: the vehicle has overstayed by 50 minutes");
  await page.reload();
  await expectText(page, /Overstayed by 50 min/);
  await pause(page, 3500);
  await frame(page, "2e-overstayed");
  await tap(page, page.getByRole("button", { name: "Record exit" }));
  await expectText(page, "How was it settled?");
  await caption("2 · The overstay charge must be settled before exit");
  await show(page, page.getByText("How was it settled?"), 2500);
  await frame(page, "2f-settlement");
  await tap(page, page.getByText("Collected — cash"));
  await pause(page, 1200);
  await tap(page, page.getByRole("button", { name: "Confirm and record exit" }));
  await expectText(page, "Inside now (0)");
  await pause(page, 2000);

  await caption("2 · Vehicle history for the space");
  await tap(page, page.getByRole("link", { name: "History" }));
  await page.waitForURL(/\/attendant\/history/);
  await expectText(page, /Overstayed 50 min/);
  await pause(page, 3500);
  await frame(page, "2g-history");
  return finishChapter(chapter, "clip-2-attendant-gate");
}

async function chapterCustomer(browser) {
  const chapter = await newChapter(browser, PHONE, "3 · A customer with an account");
  const { page, caption } = chapter;
  await login(page, "demo_customer", DEMO_PASSWORD, "/search");
  await pause(page, 1500);
  await tap(page, page.getByRole("link", { name: "My bookings" }));
  await page.waitForURL(`${BASE}/bookings`);
  await expectText(page, /Overstayed 40 min/);
  await caption("3 · My bookings");
  await pause(page, 3500);
  await frame(page, "3a-bookings");
  const done = page.locator("main li", { hasText: "Overstayed 40 min" });
  await tap(page, done.getByRole("link", { name: "View receipt" }));
  await page.waitForURL(/\/bookings\/\d+$/);
  await expectText(page, "Parking receipt");
  await caption("3 · The receipt shows entry, exit and the overstay charge");
  await pause(page, 2000);
  await show(page, page.getByText(/Overstayed 40 min/), 3500);
  await frame(page, "3b-receipt");
  return finishChapter(chapter, "clip-3-customer");
}

async function chapterOwner(browser) {
  const chapter = await newChapter(browser, DESKTOP, "4 · The parking space owner");
  const { page, caption } = chapter;
  await login(page, "demo_owner", DEMO_PASSWORD, "/owner/spaces");
  await expectText(page, "My spaces");
  await pause(page, 3000);
  await frame(page, "4a-spaces");
  await caption("4 · Today's bookings across the owner's spaces");
  await show(page, page.getByRole("heading", { name: /Today.s bookings/ }), 3500);
  await frame(page, "4b-today");

  await caption("4 · Attendants are created by the owner, per space");
  const space = page.locator("main li", { hasText: "MG Road Metro Parking" });
  await tap(page, space.getByRole("link", { name: "Edit and attendants" }));
  await page.waitForURL(/\/owner\/spaces\/\d+\/edit/);
  await show(page, page.getByRole("heading", { name: "Gate attendants" }), 2500);
  const form = page.locator("form", { hasText: "Add an attendant" });
  await type(page, form.locator("input").nth(0), "gate_ravi");
  await form.locator('input[type="password"]').fill(`Gate-${Date.now().toString(36)}-pw`);
  await pause(page, 800);
  await tap(page, form.getByRole("button", { name: "Add attendant" }));
  await expectText(page, /gate_ravi can now log in/);
  await show(page, page.getByRole("heading", { name: "Gate attendants" }), 3000);
  await frame(page, "4c-attendants");

  await caption("4 · Vehicle history, with entry photos");
  await tap(page, page.getByRole("link", { name: "View vehicle history" }));
  await page.waitForURL(/\/history/);
  await expectText(page, /Overstayed 50 min/);
  await pause(page, 3500);
  await frame(page, "4d-history");

  await caption("4 · Usage and revenue, with overstay shown separately");
  await tap(page, page.getByRole("link", { name: "Stats" }));
  await page.waitForURL(/\/owner\/stats/);
  await expectText(page, "Overstay");
  await show(page, page.locator("table"), 4000);
  await frame(page, "4e-stats");

  await caption("4 · Monthly rental paid to ParkSpotZ");
  await tap(page, page.getByRole("link", { name: "Rental" }));
  await page.waitForURL(`${BASE}/owner/rental`);
  await expectText(page, "Rental");
  await pause(page, 3500);
  await frame(page, "4f-rental");
  const invoice = page.locator("main li", { hasText: "Trinity Circle Surface Lot" });
  await show(page, invoice, 2500);
  await tap(page, invoice.getByRole("link", { name: "Pay" }));
  await page.waitForURL(/\/owner\/rental\/\d+/);
  await expectText(page, "Rental invoice");
  await pause(page, 2000);
  await tap(page, page.getByRole("button", { name: /^Pay ₹/ }));
  await expectText(page, /Test payment/i);
  await caption("4 · Paying an invoice (test mode)");
  await pause(page, 2500);
  await tap(page, page.getByRole("button", { name: /^Pay ₹/ }));
  await expectText(page, "Rental receipt");
  await pause(page, 3500);
  await frame(page, "4g-rental-receipt");
  return finishChapter(chapter, "clip-4-owner");
}

async function chapterAdmin(browser) {
  const chapter = await newChapter(browser, DESKTOP, "5 · The platform admin");
  const { page, caption } = chapter;
  await login(page, ADMIN_USERNAME, ADMIN_PASSWORD, "/admin");
  await expectText(page, "Onboarding");
  await caption("5 · Dashboard: spaces onboarded and slots managed");
  await pause(page, 3500);
  await frame(page, "5a-dashboard");
  await caption("5 · In use now, and utilisation");
  await show(page, page.getByRole("heading", { name: "Utilisation" }), 3500);
  await caption("5 · Bookings by customers and by guests; rental collected");
  await show(page, page.getByRole("heading", { name: /^Rental/ }), 4000);
  await frame(page, "5b-dashboard-lower");

  await caption("5 · Every parking space, sortable");
  await tap(page, page.getByRole("link", { name: "Spaces" }));
  await page.waitForURL(/\/admin\/spaces/);
  await expectText(page, /All spaces/);
  await pause(page, 2500);
  await tap(page, page.getByRole("link", { name: /^Slots/ }));
  await page.waitForURL(/sort=slots/);
  await pause(page, 1200);
  await tap(page, page.getByRole("link", { name: /^Slots/ }));
  await page.waitForURL(/dir=desc/);
  await pause(page, 3500);
  await frame(page, "5c-spaces");

  await caption("5 · Rental invoices: overdue ones are highlighted");
  await tap(page, page.getByRole("link", { name: "Rental" }));
  await page.waitForURL(/\/admin\/rental/);
  await expectText(page, /Invoices ·/);
  await pause(page, 3000);
  await show(page, page.locator("main li").nth(3), 3500);
  await frame(page, "5d-rental");
  await caption("5 · Rental tiers by number of slots");
  await show(page, page.getByRole("heading", { name: "Tiers" }), 1500);
  await show(page, page.getByRole("button", { name: "Save tiers" }), 3500);
  await frame(page, "5e-tiers");
  return finishChapter(chapter, "clip-5-admin");
}

// --- joining the clips ---------------------------------------------------------

function clipSeconds(file) {
  let text = "";
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", file], { stdio: "pipe" });
  } catch (err) {
    text = String(err.stderr);
  }
  // .webm files from the recorder carry no duration; decode to count it.
  const direct = /Duration: (\d+):(\d+):([\d.]+)/.exec(text);
  if (direct) return Number(direct[1]) * 3600 + Number(direct[2]) * 60 + Number(direct[3]);
  let decoded = "";
  try {
    decoded = execFileSync(ffmpeg, ["-hide_banner", "-i", file, "-f", "null", "-"], { stdio: "pipe" }).toString();
  } catch (err) {
    decoded = String(err.stderr);
  }
  const times = [...String(decoded).matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
  const last = times.at(-1);
  return last ? Number(last[1]) * 3600 + Number(last[2]) * 60 + Number(last[3]) : 0;
}

// One 1920x1080 mp4: phone chapters centred on a dark background.
function joinClips(clips) {
  const parts = [];
  for (const clip of clips) {
    const part = clip.replace(/\.webm$/, ".part.mp4");
    execFileSync(
      ffmpeg,
      ["-y", "-hide_banner", "-loglevel", "error", "-i", clip,
       "-vf", "fps=30,scale=-2:1080:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0f172a,setsar=1",
       "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-an", part],
      { stdio: "inherit" }
    );
    parts.push(part);
  }
  const list = join(OUT, ".tmp", "parts.txt");
  writeFileSync(list, parts.map((part) => `file '${part}'`).join("\n"));
  const target = join(OUT, "parkspotz-walkthrough.mp4");
  execFileSync(
    ffmpeg,
    ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", target],
    { stdio: "inherit" }
  );
  const lengths = parts.map(clipSeconds);
  for (const part of parts) rmSync(part);
  return { target, lengths };
}

const stamp = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

// --- run -----------------------------------------------------------------------

mkdirSync(join(OUT, ".tmp"), { recursive: true });
if (FRAMES) mkdirSync(FRAMES, { recursive: true });
await db.connect();
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const photo = await testPhoto(browser);
  await prepareCustomerHistory();

  const guest = await chapterGuest(browser);
  console.log(`chapter 1 done (${guest.reference})`);
  const clips = [guest.clip];
  clips.push(await chapterAttendant(browser, guest.reference, photo));
  console.log("chapter 2 done");
  clips.push(await chapterCustomer(browser));
  console.log("chapter 3 done");
  clips.push(await chapterOwner(browser));
  console.log("chapter 4 done");
  clips.push(await chapterAdmin(browser));
  console.log("chapter 5 done");

  if (ffmpeg && existsSync(ffmpeg)) {
    const { target, lengths } = joinClips(clips);
    let at = 0;
    console.log(`\nJoined video: ${target}`);
    lengths.forEach((length, index) => {
      console.log(`  chapter ${index + 1} starts at ${stamp(at)} (${Math.round(length)} s)`);
      at += length;
    });
    console.log(`  total ${stamp(at)}`);
  } else {
    console.log("\nffmpeg-static is not installed; the chapters are separate .webm clips:");
  }
  for (const clip of clips) console.log(`  ${clip}`);
} finally {
  await browser.close();
  await db.end();
  rmSync(join(OUT, ".tmp"), { recursive: true, force: true });
}
