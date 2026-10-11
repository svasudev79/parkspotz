import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { VisitHistory } from "@/components/VisitHistory";
import { todayInIst } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { Space, Visit } from "@/lib/types";

export const metadata: Metadata = { title: "Vehicle history · ParkSpotZ" };

// The same incoming/outgoing log the space's attendants see, for its owner.
export default async function SpaceHistoryPage(props: PageProps<"/owner/spaces/[id]/history">) {
  const user = await requireRole("owner");
  const { id } = await props.params;
  const space = (await apiGet<{ space: Space }>(`/spaces/${encodeURIComponent(id)}`))?.space;
  if (!space || space.owner_id !== user.id) notFound();

  const query = await props.searchParams;
  const date = typeof query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayInIst();
  const data = await apiGet<{ visits: Visit[] }>(`/visits?spaceId=${space.id}&date=${date}`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/owner/spaces" className="self-start py-3 text-sm font-medium text-emerald-700 underline">
        ← My spaces
      </Link>
      <div>
        <h1 className="text-2xl font-bold">Vehicle history</h1>
        <p className="mt-1 text-slate-600 break-words">{space.name}</p>
      </div>
      <VisitHistory action={`/owner/spaces/${space.id}/history`} date={date} visits={data?.visits ?? null} />
    </main>
  );
}
