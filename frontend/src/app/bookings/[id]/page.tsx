import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { ReceiptCard } from "@/components/ReceiptCard";
import { primaryButtonClass } from "@/components/ui";
import { apiGet, requireRole } from "@/lib/session";
import { receiptQr } from "@/lib/qr";
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
  const qr = await receiptQr(booking);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/bookings" className="self-start py-3 text-sm font-medium text-emerald-700 underline print:hidden">
        ← My bookings
      </Link>

      <ReceiptCard booking={booking} qr={qr} />

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
