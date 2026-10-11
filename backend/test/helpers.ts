// Shared setup for the API tests. They run the real Express app against the
// TEST database only: TEST_DATABASE_URL, or DATABASE_URL with "_test" added
// to the database name. Importing this file points the app at that database.
import "dotenv/config";
import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";
import type { Pool } from "pg";

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
// Test photos go to their own folder, removed again when the tests finish.
const uploadsDir = resolve("uploads", "test-run");
process.env.UPLOADS_DIR = uploadsDir;

let baseUrl = "";
export let pool: Pool;

export interface Session {
  cookie: string;
}

// Applies the schema, empties the test database and starts the API on a free port.
export async function startApp(): Promise<{ stop: () => Promise<void> }> {
  ({ pool } = await import("../src/db"));
  const { app } = await import("../src/app");
  await pool.query(readFileSync("schema.sql", "utf8"));
  await pool.query(
    "TRUNCATE users, parking_spaces, bookings, payments, space_attendants, visits RESTART IDENTITY CASCADE"
  );

  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    stop: async () => {
      await new Promise((done) => server.close(done));
      await pool.end();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
  };
}

export async function call(session: Session | null, method: string, path: string, body?: unknown) {
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

// A request with a raw (non-JSON) body or response, e.g. a photo.
export function rawCall(session: Session | null, method: string, path: string, body?: Buffer) {
  return fetch(baseUrl + path, {
    method,
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/octet-stream" }),
      ...(session ? { cookie: session.cookie } : {}),
    },
    ...(body === undefined ? {} : { body: new Uint8Array(body) }),
  });
}

export async function signup(username: string, role: "customer" | "owner"): Promise<Session> {
  const res = await call(null, "POST", "/auth/signup", { username, password: "test-password", role });
  assert.equal(res.status, 201);
  return { cookie: res.setCookie!.split(";")[0]! };
}

export async function login(username: string, password = "test-password"): Promise<Session> {
  const res = await call(null, "POST", "/auth/login", { username, password });
  assert.equal(res.status, 200);
  return { cookie: res.setCookie!.split(";")[0]! };
}

export async function createSpace(owner: Session, totalSlots: number, name?: string): Promise<number> {
  const res = await call(owner, "POST", "/spaces", {
    name: name ?? `Test space with ${totalSlots} slot(s)`,
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
export function ist(daysAhead: number, time: string): string {
  const day = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(day);
  return new Date(`${date}T${time}:00+05:30`).toISOString();
}
