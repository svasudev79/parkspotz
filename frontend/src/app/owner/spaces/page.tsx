import type { Metadata } from "next";
import Link from "next/link";
import { SpaceFacts } from "@/components/SpaceFacts";
import { cardClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { apiGet, requireRole } from "@/lib/session";
import type { Space } from "@/lib/types";

export const metadata: Metadata = { title: "My spaces · ParkSpotZ" };

export default async function OwnerSpacesPage() {
  await requireRole("owner");
  const data = await apiGet<{ spaces: Space[] }>("/owner/spaces");
  const spaces = data?.spaces ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My spaces</h1>
        <Link href="/owner/spaces/new" className={primaryButtonClass}>
          Add space
        </Link>
      </div>

      {!data && <p className="mt-6 text-red-700">Could not load your spaces. Please refresh the page.</p>}

      {data && spaces.length === 0 && (
        <p className="mt-6 text-slate-600">
          You have not listed a parking space yet. Add one so drivers can find and book it.
        </p>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {spaces.map((space) => (
          <li key={space.id} className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold break-words">{space.name}</h2>
                {!space.is_active && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                    Not listed
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 break-words">{space.address}</p>
              <p className="text-sm text-slate-600">
                {space.total_slots} {space.total_slots === 1 ? "slot" : "slots"}
              </p>
              <SpaceFacts space={space} />
            </div>
            <Link href={`/owner/spaces/${space.id}/edit`} className={`${secondaryButtonClass} shrink-0`}>
              Edit
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
