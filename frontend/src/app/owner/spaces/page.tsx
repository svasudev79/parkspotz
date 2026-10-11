import type { Metadata } from "next";
import Link from "next/link";
import { CustomerName } from "@/components/CustomerName";
import { SpaceFacts } from "@/components/SpaceFacts";
import { cardClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { apiGet, requireRole } from "@/lib/session";
import { formatRupees, formatTime } from "@/lib/format";
import type { OwnerBooking, Space } from "@/lib/types";

export const metadata: Metadata = { title: "My spaces · ParkSpotZ" };

export default async function OwnerSpacesPage() {
  await requireRole("owner");
  const [data, today, rental] = await Promise.all([
    apiGet<{ spaces: Space[] }>("/owner/spaces"),
    apiGet<{ bookings: OwnerBooking[] }>("/owner/bookings"),
    apiGet<{ summary: { due_count: number; overdue_count: number; due_amount: number } }>("/owner/rental"),
  ]);
  const spaces = data?.spaces ?? [];
  const rent = rental?.summary;
  const todaysBookings = today?.bookings ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">My spaces</h1>
        <Link href="/owner/spaces/new" className={primaryButtonClass}>
          Add space
        </Link>
      </div>

      {rent && rent.due_count > 0 && (
        <Link
          href="/owner/rental"
          className={`mt-4 block rounded-lg px-3 py-3 text-base font-medium underline ${
            rent.overdue_count > 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          Rental: {formatRupees(rent.due_amount)} {rent.overdue_count > 0 ? "to pay, some of it overdue" : "due"} — view and
          pay
        </Link>
      )}

      {!data && <p className="mt-6 text-red-700">Could not load your spaces. Please refresh the page.</p>}

      {data && spaces.length === 0 && (
        <p className="mt-6 text-slate-600">
          You have not listed a parking space yet. Add one so customers can find and book it.
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
            <div className="flex shrink-0 gap-2 sm:flex-col">
              <Link href={`/owner/spaces/${space.id}/edit`} className={`${secondaryButtonClass} flex-1`}>
                Edit and attendants
              </Link>
              <Link href={`/owner/spaces/${space.id}/history`} className={`${secondaryButtonClass} flex-1`}>
                Vehicle history
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {spaces.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">Today&apos;s bookings</h2>
          {todaysBookings.length === 0 ? (
            <p className="mt-2 text-slate-600">No paid bookings start today.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {todaysBookings.map((booking) => (
                <li key={booking.id} className={`${cardClass} flex flex-col gap-1`}>
                  <p className="font-semibold">
                    {formatTime(booking.start_time)} to {formatTime(booking.end_time)}
                    <span className="font-normal text-slate-600"> · {booking.space_name}</span>
                  </p>
                  <p className="text-sm text-slate-600">
                    <CustomerName name={booking.customer} guest={booking.is_guest} /> · {formatRupees(booking.amount)} ·{" "}
                    {booking.reference}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
