// Server-side session helpers. The session lives in an httpOnly cookie set by
// the API, so pages ask the API who the visitor is.
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { homeFor, type Role, type User } from "./types";

const API_URL = process.env.API_URL ?? "http://localhost:8080";

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const cookieHeader = (await cookies()).toString();
  if (!cookieHeader) return null;
  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()).user as User;
  } catch {
    return null;
  }
});

// For pages that need a login: sends visitors to /login, and users with the
// wrong role to their own home page.
export async function requireRole(role: Role): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}

// For the login and sign-up pages: logged-in users go straight to their home.
export async function redirectIfLoggedIn(): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
}
