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

// 401 if not logged in, 403 if logged in with a different role.
export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    requireAuth(req, res, () => {
      if (req.user?.role !== role) {
        return res.status(403).json({ error: `Only ${role}s can do this` });
      }
      next();
    });
  };
}
