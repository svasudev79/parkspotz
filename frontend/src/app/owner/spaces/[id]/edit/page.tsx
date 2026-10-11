import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SpaceForm } from "@/components/SpaceForm";
import { apiGet, requireRole } from "@/lib/session";
import type { Space } from "@/lib/types";

export const metadata: Metadata = { title: "Edit space · ParkSpotZ" };

export default async function EditSpacePage(props: PageProps<"/owner/spaces/[id]/edit">) {
  const user = await requireRole("owner");
  const { id } = await props.params;
  const data = await apiGet<{ space: Space }>(`/spaces/${encodeURIComponent(id)}`);
  // Owners can only edit their own spaces.
  if (!data || data.space.owner_id !== user.id) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Edit {data.space.name}</h1>
      <SpaceForm space={data.space} />
    </main>
  );
}
