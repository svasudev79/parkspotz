import { Router } from "express";
import bcrypt from "bcryptjs";
import { pool } from "../db";
import { requireAuth } from "../middleware/auth";
import { SESSION_COOKIE, sessionCookieOptions, signSession, type SessionUser } from "../session";
import { isRole, normalizeUsername, validateSignup } from "../validation";

export const authRouter = Router();

const BCRYPT_ROUNDS = 10;
const UNIQUE_VIOLATION = "23505";
// Compared against when the username does not exist, so both failures take similar time.
const DUMMY_HASH = bcrypt.hashSync("no-such-user", BCRYPT_ROUNDS);

// POST /auth/signup — create an account and log it in.
authRouter.post("/signup", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const { password, role } = req.body ?? {};
  const problem = validateSignup(username, password, role);
  if (problem || !isRole(role)) return res.status(400).json({ error: problem });

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const { rows } = await pool.query(
      `INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)
       RETURNING id, username, role`,
      [username, passwordHash, role]
    );
    const user: SessionUser = rows[0];
    res.cookie(SESSION_COOKIE, signSession(user), sessionCookieOptions);
    res.status(201).json({ user });
  } catch (err) {
    if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
      return res.status(409).json({ error: "That username is already taken" });
    }
    throw err;
  }
});

// POST /auth/login
authRouter.post("/login", async (req, res) => {
  const username = normalizeUsername(req.body?.username);
  const password = req.body?.password;
  if (!username || typeof password !== "string" || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  const { rows } = await pool.query(
    "SELECT id, username, role, password_hash FROM users WHERE username = $1",
    [username]
  );
  const row = rows[0];
  const matches = await bcrypt.compare(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !matches) {
    return res.status(401).json({ error: "Wrong username or password" });
  }

  const user: SessionUser = { id: row.id, username: row.username, role: row.role };
  res.cookie(SESSION_COOKIE, signSession(user), sessionCookieOptions);
  res.json({ user });
});

// POST /auth/logout
authRouter.post("/logout", (_req, res) => {
  const { maxAge: _maxAge, ...clearOptions } = sessionCookieOptions;
  res.clearCookie(SESSION_COOKIE, clearOptions);
  res.json({ ok: true });
});

// GET /auth/me — the logged-in user, re-read from the database.
authRouter.get("/me", requireAuth, async (req, res) => {
  const { rows } = await pool.query("SELECT id, username, role FROM users WHERE id = $1", [
    req.user!.id,
  ]);
  if (rows.length === 0) return res.status(401).json({ error: "Please log in" });
  res.json({ user: rows[0] });
});
