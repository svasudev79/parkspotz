import type { Booking } from "@/lib/types";
import { BookingStatus } from "./BookingStatus";
import { BookingSummary } from "./BookingSummary";
import { VisitSummary } from "./VisitSummary";
import { cardClass } from "./ui";

// The receipt itself: booking details, any visit and overstay, and the QR code
// once the booking is paid. Shared by the customer and guest receipt pages.
export function ReceiptCard({ booking, qr }: { booking: Booking; qr: string | null }) {
  return (
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
  );
}
