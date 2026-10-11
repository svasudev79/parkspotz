export interface Credentials {
  username: string;
  password: string;
}

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72; // bcrypt ignores anything past 72 bytes

// Usernames are case-insensitive: they are trimmed and lower-cased before use.
export function normalizeUsername(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// Username and password rules, shared by signup and attendant accounts.
// Returns an error message, or null when both are acceptable.
export function validateCredentials(username: string, password: unknown): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return "Username must be 3-30 characters: letters, numbers, dot or underscore";
  }
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX) {
    return `Password must be at most ${PASSWORD_MAX} characters`;
  }
  return null;
}

// Returns an error message, or null when the signup input is valid.
export function validateSignup(username: string, password: unknown, role: unknown): string | null {
  return validateCredentials(username, password) ?? (isSignupRole(role) ? null : "Choose a role: customer or owner");
}

// The roles a visitor may pick when signing up. Attendant accounts are only
// ever created by a space owner.
export function isSignupRole(value: unknown): value is "customer" | "owner" {
  return value === "customer" || value === "owner";
}
