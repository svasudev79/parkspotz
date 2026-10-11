import type { Metadata } from "next";
import { SpaceForm } from "@/components/SpaceForm";
import { requireRole } from "@/lib/session";

export const metadata: Metadata = { title: "Add space · ParkSpotZ" };

export default async function NewSpacePage() {
  await requireRole("owner");
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Add a parking space</h1>
      <SpaceForm />
    </main>
  );
}
