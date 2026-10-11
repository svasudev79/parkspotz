import type { Metadata } from "next";
import { SearchScreen } from "@/components/SearchScreen";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Find parking · ParkSpotZ" };

export default async function SearchPage() {
  await requireRole("driver");

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-bold">Find parking</h1>
      <SearchScreen />
    </main>
  );
}
