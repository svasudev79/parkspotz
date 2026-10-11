import type { Metadata } from "next";
import Link from "next/link";
import { BookingStatus } from "@/components/BookingStatus";
import { VisitSummary } from "@/components/VisitSummary";
import { cardClass, primaryButtonClass } from "@/components/ui";
import { formatRupees, formatWindow } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import { bookingState, type Booking } from "@/lib/types";

export const metadata: Metadata = { title: "My bookings · ParkSpotZ" };

export default async function BookingsPage() {
  await requireRole("customer");
  const data = await apiGet<{ bookings: Booking[] }>("/bookings");
  const bookings = data?.bookings ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">My bookings</h1>

      {!data && <p className="mt-6 text-red-700">Could not load your bookings. Please refresh the page.</p>}
      {data && bookings.length === 0 && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-slate-600">You have no bookings yet.</p>
          <Link href="/search" className={primaryButtonClass}>
            Find parking
          </Link>
        </div>
      )}

      <ul className="mt-6 flex flex-col gap-3">
        {bookings.map((booking) => {
          const state = bookingState(booking);
          return (
            <li key={booking.id} className={`${cardClass} flex flex-col gap-2`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h2 className="min-w-0 text-lg font-semibold break-words">{booking.space_name}</h2>
                <BookingStatus booking={booking} />
              </div>
              <p className="text-sm text-slate-600">{formatWindow(booking.start_time, booking.end_time)}</p>
              <p className="text-sm text-slate-600">
                <span className="font-semibold text-slate-900">{formatRupees(booking.amount)}</span> ·{" "}
                {booking.reference}
              </p>
              <VisitSummary booking={booking} />
              <Link
                href={state === "awaiting payment" ? `/bookings/${booking.id}/pay` : `/bookings/${booking.id}`}
                className="inline-flex h-11 items-center self-start rounded-lg text-base font-semibold text-emerald-700 underline"
              >
                {state === "confirmed" ? "View receipt" : state === "awaiting payment" ? "Pay now" : "View booking"}
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
