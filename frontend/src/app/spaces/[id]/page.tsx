import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cardClass, primaryButtonClass } from "@/components/ui";
import { capitalize, formatDateTime, formatRupees, formatTime } from "@/lib/format";
import { apiGet, requireUser } from "@/lib/session";
import { homeFor, type Space } from "@/lib/types";

export const metadata: Metadata = { title: "Parking space · ParkSpotZ" };

// A valid ISO date-time from the query string, or null.
function parseTime(value: string | string[] | undefined): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export default async function SpacePage(props: PageProps<"/spaces/[id]">) {
  const user = await requireUser();
  const { id } = await props.params;
  const query = await props.searchParams;
  const data = await apiGet<{ space: Space }>(`/spaces/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const space = data.space;

  // The time window chosen on the search screen, when the driver came from there.
  const start = parseTime(query.start);
  const end = parseTime(query.end);
  const hours = start && end && end > start ? (end.getTime() - start.getTime()) / 3_600_000 : null;

  const facts: [string, string][] = [
    ["Price", `${formatRupees(space.price_per_hour)} per hour`],
    ["Open", `${space.open_time} to ${space.close_time} IST, every day`],
    ["Slots", String(space.total_slots)],
    ["Type", capitalize(space.space_type)],
    ["Ownership", capitalize(space.ownership)],
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href={homeFor(user.role)} className="inline-block self-start py-2 text-sm font-medium text-emerald-700 underline">
        ← Back to {user.role === "owner" ? "my spaces" : "search"}
      </Link>

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

      {user.role === "driver" && (
        <section className={`${cardClass} flex flex-col gap-3`}>
          <h2 className="text-lg font-semibold">Book this space</h2>
          {start && end && hours ? (
            <p className="text-slate-700">
              {formatDateTime(start)} to {formatTime(end)} IST · {hours} {hours === 1 ? "hour" : "hours"} ·{" "}
              <span className="font-semibold">{formatRupees(Math.round(hours * space.price_per_hour * 100) / 100)}</span>
            </p>
          ) : (
            <p className="text-slate-700">Search with a date and time to see the price for your visit.</p>
          )}
          <button type="button" disabled className={primaryButtonClass}>
            Book
          </button>
          <p className="text-sm text-slate-500">Booking and payment are coming soon.</p>
        </section>
      )}
    </main>
  );
}
