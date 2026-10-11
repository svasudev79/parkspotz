// Checks that keep a deployment from starting, or a script from running, in an
// unsafe state. Everything here is a pure function of its arguments, so it can
// be tested without a database or a real environment.

const WEAK_WORDS = ["password", "admin", "parkspotz", "demo", "changeme", "change-me", "123456", "qwerty", "letmein"];

// Is this password strong enough for an account on a public deployment?
// `label` is the setting's name, used in the message. Returns a problem or null.
// The password itself never appears in the message.
export function passwordProblem(label: string, username: string, password: string): string | null {
  if (password.length < 12) return `${label} must be at least 12 characters`;
  if (Buffer.byteLength(password, "utf8") > 72) return `${label} must be at most 72 characters`;
  const lower = password.toLowerCase();
  if ((username && lower.includes(username.toLowerCase())) || WEAK_WORDS.some((word) => lower.includes(word))) {
    return `${label} is too easy to guess; use a long random value`;
  }
  if (new Set(password).size < 6) return `${label} is too repetitive; use a long random value`;
  return null;
}

// What must be true before the API may start with NODE_ENV=production.
// Returns the list of problems (empty when it is safe to start).
export function productionProblems(settings: {
  paymentMode: string;
  jwtSecret: string;
  appBaseUrl: string;
}): string[] {
  const problems: string[] = [];
  if (settings.paymentMode === "mock") {
    problems.push(
      "PAYMENT_MODE resolves to mock, which lets anyone mark a booking paid. Set PAYMENT_MODE=razorpay with RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
    );
  }
  if (settings.jwtSecret.length < 32) {
    problems.push("JWT_SECRET must be at least 32 characters; generate a long random value.");
  }
  let https = false;
  try {
    https = new URL(settings.appBaseUrl).protocol === "https:";
  } catch {
    https = false;
  }
  if (!https) {
    problems.push("APP_BASE_URL must be the public https:// address of the website (receipt QR codes link to it).");
  }
  return problems;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", ""];

// Which database a connection string points at: host and database name only,
// never the user, password or full URL.
export function databaseTarget(databaseUrl: string): { host: string; database: string; isLocal: boolean } {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid postgres:// URL");
  }
  const host = url.hostname;
  return {
    host: host || "(local socket)",
    database: decodeURIComponent(url.pathname.replace(/^\//, "")) || "(default)",
    isLocal: LOCAL_HOSTS.includes(host),
  };
}

// For scripts that change a database: says which one is about to be changed,
// and refuses a database on another machine unless CONFIRM_REMOTE=yes is set,
// so nobody migrates or seeds the wrong database by accident.
// Returns the line to print, or throws with the reason.
export function confirmDatabaseTarget(databaseUrl: string, confirmRemote: string | undefined, action: string): string {
  const target = databaseTarget(databaseUrl);
  const line = `${action}: database "${target.database}" on host ${target.host}`;
  if (!target.isLocal && confirmRemote !== "yes") {
    throw new Error(
      `${line}\nThis is not a local database. If it is the one you mean, run the command again with CONFIRM_REMOTE=yes.`
    );
  }
  return line;
}
