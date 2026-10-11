import type { Metadata } from "next";
import Link from "next/link";
import { BookingStatus } from "@/components/BookingStatus";
import { VisitSummary } from "@/components/VisitSummary";
import { cardClass, primaryButtonClass } from "@/components/ui";
import { formatRupees, formatWindow } from "@/lib/format";
import { apiGet, customerOrGuest } from "@/lib/session";
import { bookingState, type Booking } from "@/lib/types";

export const metadata: Metadata = { title: "My bookings · ParkSpotZ" };

export default async function BookingsPage() {
  // Customers see their account's bookings; a visitor who is not logged in
  // sees the guest bookings made in this browser.
  const user = await customerOrGuest();
  const data = await apiGet<{ bookings: Booking[] }>(user ? "/bookings" : "/guest/bookings");
  const bookings = data?.bookings ?? [];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <h1 className="text-2xl font-bold">My bookings</h1>
      {!user && (
        <p className="mt-2 text-sm text-slate-600">
          Bookings made as a guest in this browser.{" "}
          <Link href="/signup?next=/bookings" className="font-medium text-emerald-700 underline">
            Sign up
          </Link>{" "}
          or{" "}
          <Link href="/login?next=/bookings" className="font-medium text-emerald-700 underline">
            log in
          </Link>{" "}
          as a customer to move them into an account and see them on any device.
        </p>
      )}

      {!data && <p className="mt-6 text-red-700">Could not load your bookings. Please refresh the page.</p>}
      {data && bookings.length === 0 && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-slate-600">You have no bookings yet.</p>
          <Link href={user ? "/search" : "/"} className={primaryButtonClass}>
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
                href={`${user ? `/bookings/${booking.id}` : `/receipt/${booking.access_token}`}${
                  state === "awaiting payment" ? "/pay" : ""
                }`}
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
