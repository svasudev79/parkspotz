import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyLinkButton } from "@/components/CopyLinkButton";
import { PrintButton } from "@/components/PrintButton";
import { ReceiptCard } from "@/components/ReceiptCard";
import { primaryButtonClass } from "@/components/ui";
import { receiptQr } from "@/lib/qr";
import { apiGet } from "@/lib/session";
import { bookingState, type Booking } from "@/lib/types";

// A guest's private receipt link. Whoever has the link can see the receipt,
// so it is kept out of search engines and out of the Referer header sent to
// other sites (see also next.config.ts).
export const metadata: Metadata = {
  title: "Receipt · ParkSpotZ",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function GuestReceiptPage(props: PageProps<"/receipt/[token]">) {
  const { token } = await props.params;
  const data = await apiGet<{ booking: Booking }>(`/guest/bookings/${encodeURIComponent(token)}`);
  if (!data) notFound();
  const { booking } = data;
  const state = bookingState(booking);
  const qr = await receiptQr(booking);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      {qr && (
        <div className="flex flex-col gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 p-4 print:hidden">
          <p className="text-base font-semibold text-amber-900">Save this page — it is your only copy</p>
          <p className="text-sm text-amber-900">
            You booked as a guest, so there is no account to find this receipt in later. Bookmark this page, copy
            its link, or save it as a PDF. Anyone with the link can see the receipt, so do not share it.
          </p>
          <CopyLinkButton />
        </div>
      )}

      <ReceiptCard booking={booking} qr={qr} />

      {qr && <PrintButton />}
      {state === "awaiting payment" && (
        <Link href={`/receipt/${encodeURIComponent(token)}/pay`} className={primaryButtonClass}>
          Pay now
        </Link>
      )}
      {(state === "expired" || state === "cancelled") && (
        <p className="text-slate-600">
          {state === "expired" ? "This booking was not paid in time." : "This booking was cancelled."} No slot is
          reserved.
        </p>
      )}
      <Link href="/bookings" className="self-start py-3 text-sm font-medium text-emerald-700 underline print:hidden">
        Bookings made in this browser
      </Link>
    </main>
  );
}
