import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink } from "@/components/BackLink";
import { BookingPanel } from "@/components/BookingPanel";
import { cardClass } from "@/components/ui";
import { capitalize, formatRupees } from "@/lib/format";
import { apiGet, getCurrentUser } from "@/lib/session";
import { homeFor, type Space } from "@/lib/types";

export const metadata: Metadata = { title: "Parking space · ParkSpotZ" };

// A valid ISO date-time from the query string, or null.
function parseTime(value: string | string[] | undefined): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function SpacePage(props: PageProps<"/spaces/[id]">) {
  // Open to guests (not logged in), customers and owners.
  const user = await getCurrentUser();
  if (user && user.role !== "customer" && user.role !== "owner") redirect(homeFor(user.role));
  const { id } = await props.params;
  const query = await props.searchParams;
  const data = await apiGet<{ space: Space }>(`/spaces/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const space = data.space;

  // The time window chosen on the search screen, when the customer came from there.
  const start = parseTime(query.start);
  const endTime = parseTime(query.end);
  const end = start && endTime && endTime > start ? endTime : null;

  const facts: [string, string][] = [
    ["Price", `${formatRupees(space.price_per_hour)} per hour`],
    ["Open", `${space.open_time} to ${space.close_time} IST, every day`],
    ["Slots", String(space.total_slots)],
    ["Type", capitalize(space.space_type)],
    ["Ownership", capitalize(space.ownership)],
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <BackLink fallback={user ? homeFor(user.role) : "/"}>
        ← Back to {user?.role === "owner" ? "my spaces" : "search"}
      </BackLink>

      <div>
        <h1 className="text-2xl font-bold break-words">{space.name}</h1>
        <p className="mt-1 text-slate-600 break-words">{space.address}</p>
      </div>

      <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base`}>
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {user?.role !== "owner" && (
        <BookingPanel
          space={space}
          start={start && end ? start.toISOString() : null}
          end={start && end ? end.toISOString() : null}
          guest={!user}
        />
      )}
    </main>
  );
}
