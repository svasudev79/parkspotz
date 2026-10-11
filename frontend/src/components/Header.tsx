import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { homeFor, type Role } from "@/lib/types";
import { LogoutButton } from "./LogoutButton";

const NAV: Record<Role, { href: string; label: string }[]> = {
  customer: [
    { href: "/search", label: "Find parking" },
    { href: "/bookings", label: "My bookings" },
  ],
  owner: [
    { href: "/owner/spaces", label: "My spaces" },
    { href: "/owner/stats", label: "Stats" },
  ],
};

const navLinkClass = "rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100";

export async function Header() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white print:hidden">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
        <Link href={user ? homeFor(user.role) : "/login"} className="py-2 text-lg font-bold text-emerald-700">
          ParkSpotZ
        </Link>

        {user ? (
          <>
            <div className="flex min-w-0 items-center gap-3 sm:order-3">
              <span className="min-w-0 truncate text-sm text-slate-600">
                {user.username} <span className="text-slate-400">· {user.role}</span>
              </span>
              <LogoutButton />
            </div>
            {/* Own row on phones, inline between logo and user on wider screens. */}
            <nav className="-mx-3 flex w-full items-center gap-1 sm:order-2 sm:mx-0 sm:w-auto sm:flex-1">
              {NAV[user.role].map((item) => (
                <Link key={item.href} href={item.href} className={navLinkClass}>
                  {item.label}
                </Link>
              ))}
            </nav>
          </>
        ) : (
          <nav className="flex items-center gap-1">
            <Link href="/login" className={navLinkClass}>
              Log in
            </Link>
            <Link href="/signup" className={`${navLinkClass} text-emerald-700`}>
              Sign up
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}
