import type { Metadata } from "next";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Find parking · ParkSpotZ" };

export default async function SearchPage() {
  const user = await requireRole("driver");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold">Find parking</h1>
      <p className="mt-2 text-slate-600">
        Welcome, {user.username}. Destination search with a map and a list of nearby parking spaces is coming
        next.
      </p>
    </main>
  );
}
