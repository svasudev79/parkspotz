import type { Metadata } from "next";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "My spaces · ParkSpotZ" };

export default async function OwnerSpacesPage() {
  const user = await requireRole("owner");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-bold">My spaces</h1>
      <p className="mt-2 text-slate-600">
        Welcome, {user.username}. Adding and managing your parking spaces is coming next.
      </p>
    </main>
  );
}
