import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { homeFor } from "@/lib/types";
import { LogoutButton } from "./LogoutButton";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
        <Link href={user ? homeFor(user.role) : "/login"} className="text-lg font-bold text-emerald-700">
          ParkSpotZ
        </Link>

        {user ? (
          <div className="flex min-w-0 items-center gap-3">
            <span className="min-w-0 truncate text-sm text-slate-600">
              {user.username} <span className="text-slate-400">· {user.role}</span>
            </span>
            <LogoutButton />
          </div>
        ) : (
          <nav className="flex items-center gap-1 text-sm font-medium">
            <Link href="/login" className="rounded-lg px-3 py-2.5 text-slate-700 hover:bg-slate-100">
              Log in
            </Link>
            <Link href="/signup" className="rounded-lg px-3 py-2.5 text-emerald-700 hover:bg-emerald-50">
              Sign up
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
