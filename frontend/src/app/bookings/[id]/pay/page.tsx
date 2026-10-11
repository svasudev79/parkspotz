import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookingSummary } from "@/components/BookingSummary";
import { PaymentPanel } from "@/components/PaymentPanel";
import { cardClass, secondaryButtonClass } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import { bookingState, type Booking, type PaymentInfo } from "@/lib/types";

export const metadata: Metadata = { title: "Pay · ParkSpotZ" };

export default async function PayPage(props: PageProps<"/bookings/[id]/pay">) {
  await requireRole("customer");
  const { id } = await props.params;
  const data = await apiGet<{ booking: Booking; payment: PaymentInfo }>(`/bookings/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { booking, payment } = data;
  const state = bookingState(booking);
  if (state === "confirmed") redirect(`/bookings/${booking.id}`);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Pay for your booking</h1>
      <div className={cardClass}>
        <BookingSummary booking={booking} />
      </div>

      {state === "awaiting payment" ? (
        <>
          <p className="text-sm text-slate-600">
            Your slot is held until {formatTime(booking.hold_expires_at)} IST. Pay before then to keep it.
          </p>
          <PaymentPanel booking={booking} payment={payment} />
        </>
      ) : (
        <>
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-slate-700">
            {state === "expired"
              ? "This booking was not paid in time, so the slot was released."
              : "This booking was cancelled."}{" "}
            You can book the space again.
          </p>
          <Link href={`/spaces/${booking.space_id}`} className={secondaryButtonClass}>
            Back to the space
          </Link>
        </>
      )}
    </main>
  );
}
