import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AttendantsManager } from "@/components/AttendantsManager";
import { SpaceForm } from "@/components/SpaceForm";
import { secondaryButtonClass } from "@/components/ui";
import { apiGet, requireRole } from "@/lib/session";
import type { Attendant, Space } from "@/lib/types";

export const metadata: Metadata = { title: "Edit space · ParkSpotZ" };

export default async function EditSpacePage(props: PageProps<"/owner/spaces/[id]/edit">) {
  const user = await requireRole("owner");
  const { id } = await props.params;
  const data = await apiGet<{ space: Space }>(`/spaces/${encodeURIComponent(id)}`);
  // Owners can only edit their own spaces.
  if (!data || data.space.owner_id !== user.id) notFound();
  const space = data.space;
  const staff = await apiGet<{ attendants: Attendant[] }>(`/owner/spaces/${space.id}/attendants`);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-6">
      <h1 className="text-2xl font-bold">Edit {space.name}</h1>
      <SpaceForm space={space} />

      <section className="mt-10 flex flex-col gap-3 border-t border-slate-200 pt-6">
        <h2 className="text-xl font-bold">Gate attendants</h2>
        <p className="text-slate-600">
          Attendants check bookings and record vehicles entering and leaving this space. They only see this
          space, and never prices or revenue.
        </p>
        <AttendantsManager spaceId={space.id} attendants={staff?.attendants ?? []} />
      </section>

      <section className="mt-10 flex flex-col items-start gap-3 border-t border-slate-200 pt-6">
        <h2 className="text-xl font-bold">Vehicle history</h2>
        <p className="text-slate-600">Vehicles that entered and left this space, with entry photos.</p>
        <Link href={`/owner/spaces/${space.id}/history`} className={secondaryButtonClass}>
          View vehicle history
        </Link>
      </section>
    </main>
  );
}
