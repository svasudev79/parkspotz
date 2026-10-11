// Tests for the pure safety checks: what stops a production start, what makes
// a password acceptable, and the guard on scripts that change a database.
// No database or server is needed here.
import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmDatabaseTarget, databaseTarget, passwordProblem, productionProblems } from "../src/safety";

const SAFE = { paymentMode: "razorpay", jwtSecret: "x".repeat(32), appBaseUrl: "https://parkspotz.example" };

test("production start-up: a safe configuration has no problems", () => {
  assert.deepEqual(productionProblems(SAFE), []);
});

test("production start-up is refused for mock payments, a short JWT secret, or a non-https APP_BASE_URL", () => {
  assert.match(productionProblems({ ...SAFE, paymentMode: "mock" })[0]!, /PAYMENT_MODE/);
  assert.match(productionProblems({ ...SAFE, jwtSecret: "x".repeat(31) })[0]!, /JWT_SECRET/);
  for (const appBaseUrl of ["http://parkspotz.example", "http://localhost:3000", "parkspotz.example", ""]) {
    assert.match(productionProblems({ ...SAFE, appBaseUrl })[0]!, /APP_BASE_URL/, appBaseUrl);
  }
  // All three at once are all reported, and no secret value is echoed back.
  const secret = "short-secret-value";
  const all = productionProblems({ paymentMode: "mock", jwtSecret: secret, appBaseUrl: "http://x" });
  assert.equal(all.length, 3);
  assert.doesNotMatch(all.join(" "), new RegExp(secret));
});

test("passwords for public accounts: long random values pass, short, guessable or repetitive ones do not", () => {
  assert.equal(passwordProblem("X", "admin", "kT9-vLq2_Zx8Wm4RbN7c"), null);
  for (const weak of ["short1!", "parkspotz-demo", "MyAdminLogin2026", "password-password", "aaaaaaaaaaaaaaaa", "x".repeat(80)]) {
    const problem = passwordProblem("DEMO_PASSWORD", "admin", weak);
    assert.ok(problem, weak);
    assert.match(problem, /^DEMO_PASSWORD /);
    assert.ok(!problem.includes(weak), "the password is never echoed");
  }
});

test("database target: only host and database name are reported, and local hosts are recognised", () => {
  assert.deepEqual(databaseTarget("postgres://parkspotz@127.0.0.1:5433/parkspotz"), {
    host: "127.0.0.1", database: "parkspotz", isLocal: true,
  });
  assert.equal(databaseTarget("postgres://u:pw@localhost/app").isLocal, true);
  assert.equal(databaseTarget("postgres://u:pw@[::1]:5432/app").isLocal, true);
  const remote = databaseTarget("postgres://app_user:s3cr3t-pw@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require");
  assert.deepEqual(remote, { host: "ep-cool-name-pooler.ap-southeast-1.aws.neon.tech", database: "neondb", isLocal: false });
  assert.throws(() => databaseTarget("not a url"), /DATABASE_URL/);
});

test("scripts refuse a remote database without CONFIRM_REMOTE=yes, and never print the password", () => {
  const remote = "postgres://app_user:s3cr3t-pw@db.example.com/prod?sslmode=require";
  assert.throws(
    () => confirmDatabaseTarget(remote, undefined, "Seeding"),
    (err: Error) => /CONFIRM_REMOTE=yes/.test(err.message) && /db\.example\.com/.test(err.message) && !/s3cr3t-pw|app_user/.test(err.message)
  );
  assert.throws(() => confirmDatabaseTarget(remote, "y", "Seeding"), /CONFIRM_REMOTE=yes/);
  const line = confirmDatabaseTarget(remote, "yes", "Seeding");
  assert.equal(line, 'Seeding: database "prod" on host db.example.com');
  // A local database needs no confirmation.
  assert.equal(
    confirmDatabaseTarget("postgres://parkspotz@127.0.0.1:5433/parkspotz", undefined, "Seeding"),
    'Seeding: database "parkspotz" on host 127.0.0.1'
  );
});
