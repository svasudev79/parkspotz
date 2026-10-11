import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession, type Role, type SessionUser } from "../session";

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

// 401 unless the request carries a valid session cookie; sets req.user.
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!user) return res.status(401).json({ error: "Please log in" });
  req.user = user;
  next();
}

// For public routes: anonymous visitors are let through (req.user stays
// undefined); a logged-in user must have one of the listed roles.
export function publicOr(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = verifySession(req.cookies?.[SESSION_COOKIE]);
    if (user && !roles.includes(user.role)) {
      return res.status(403).json({ error: "You do not have access to this" });
    }
    if (user) req.user = user;
    next();
  };
}

// 401 if not logged in, 403 if logged in with a role that is not listed.
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        const message = roles.length === 1 ? `Only ${roles[0]}s can do this` : "You do not have access to this";
        return res.status(403).json({ error: message });
      }
      next();
    });
  };
}
