import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BookingStatus } from "@/components/BookingStatus";
import { BookingSummary } from "@/components/BookingSummary";
import { PrintButton } from "@/components/PrintButton";
import { VisitSummary } from "@/components/VisitSummary";
import { cardClass, primaryButtonClass } from "@/components/ui";
import { apiGet, requireRole } from "@/lib/session";
import { bookingState, type Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Receipt · ParkSpotZ" };

// Receipt for a confirmed booking; a short status page for any other booking.
export default async function BookingPage(props: PageProps<"/bookings/[id]">) {
  await requireRole("customer");
  const { id } = await props.params;
  const data = await apiGet<{ booking: Booking }>(`/bookings/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { booking } = data;
  const state = bookingState(booking);
  // The QR code holds the link an owner opens to check this booking at entry.
  const qr = booking.verify_url ? await QRCode.toDataURL(booking.verify_url, { width: 480, margin: 1 }) : null;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/bookings" className="self-start py-3 text-sm font-medium text-emerald-700 underline print:hidden">
        ← My bookings
      </Link>

      <article className={`${cardClass} flex flex-col gap-4 print:border-0 print:p-0`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{qr ? "Parking receipt" : "Booking"}</h1>
          <BookingStatus booking={booking} />
        </div>
        <p className="hidden text-sm text-slate-600 print:block">ParkSpotZ</p>

        <BookingSummary booking={booking} />
        <VisitSummary booking={booking} />

        {qr && (
          <div className="flex flex-col items-center gap-2 border-t border-slate-200 pt-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL, nothing to optimise */}
            <img src={qr} alt="QR code for this booking" width={240} height={240} className="h-60 w-60" />
            <p className="text-center text-sm text-slate-600">Show this code at the entrance.</p>
          </div>
        )}
      </article>

      {qr && <PrintButton />}
      {state === "awaiting payment" && (
        <Link href={`/bookings/${booking.id}/pay`} className={primaryButtonClass}>
          Pay now
        </Link>
      )}
      {(state === "expired" || state === "cancelled") && (
        <p className="text-slate-600">
          {state === "expired" ? "This booking was not paid in time." : "This booking was cancelled."} No slot is
          reserved.
        </p>
      )}
    </main>
  );
}
