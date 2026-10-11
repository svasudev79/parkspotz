import type { CookieOptions } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config";

export type Role = "driver" | "owner";

export interface SessionUser {
  id: number;
  username: string;
  role: Role;
}

export const SESSION_COOKIE = "parkspotz_session";
const SESSION_DAYS = 7;

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: config.isProduction,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};

export function signSession(user: SessionUser): string {
  return jwt.sign({ username: user.username, role: user.role }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: `${SESSION_DAYS}d`,
    algorithm: "HS256",
  });
}

// Returns the user stored in a session token, or null if it is missing, expired or forged.
export function verifySession(token: unknown): SessionUser | null {
  if (typeof token !== "string" || !token) return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    if (typeof payload === "string") return null;
    const id = Number(payload.sub);
    const { username, role } = payload;
    if (!Number.isInteger(id) || typeof username !== "string") return null;
    if (role !== "driver" && role !== "owner") return null;
    return { id, username, role };
  } catch {
    return null;
  }
}
