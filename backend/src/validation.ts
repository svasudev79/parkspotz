import type { Role } from "./session";

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

// Returns an error message, or null when the signup input is valid.
export function validateSignup(username: string, password: unknown, role: unknown): string | null {
  if (!USERNAME_PATTERN.test(username)) {
    return "Username must be 3-30 characters: letters, numbers, dot or underscore";
  }
  if (typeof password !== "string" || password.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX) {
    return `Password must be at most ${PASSWORD_MAX} characters`;
  }
  if (!isRole(role)) return "Choose a role: customer or owner";
  return null;
}

export function isRole(value: unknown): value is Role {
  return value === "customer" || value === "owner";
}
