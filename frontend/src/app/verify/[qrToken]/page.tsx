import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cardClass } from "@/components/ui";
import { formatRupees, formatTime, formatWindow } from "@/lib/format";
import { apiGet, getCurrentUser } from "@/lib/session";
import type { VerifyResult } from "@/lib/types";

export const metadata: Metadata = { title: "Check booking · ParkSpotZ" };

const BANNERS = {
  current: { title: "Valid — let them in", colour: "border-emerald-600 bg-emerald-50 text-emerald-900" },
  upcoming: { title: "Valid, but not started yet", colour: "border-amber-500 bg-amber-50 text-amber-900" },
  over: { title: "This booking has ended", colour: "border-red-500 bg-red-50 text-red-900" },
  invalid: { title: "Not valid", colour: "border-red-500 bg-red-50 text-red-900" },
};

// The page a receipt's QR code opens. Owners see whether the booking is valid
// for one of their spaces; everyone else is asked to log in as an owner.
export default async function VerifyPage(props: PageProps<"/verify/[qrToken]">) {
  const { qrToken } = await props.params;
  const here = `/verify/${encodeURIComponent(qrToken)}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  if (user.role !== "owner") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6">
        <h1 className="text-2xl font-bold">Owners only</h1>
        <p className="text-slate-700">
          This link is for parking space owners to check a booking at the entrance. Your receipts are under My
          bookings.
        </p>
      </main>
    );
  }

  const result = await apiGet<VerifyResult>(here);
  const booking = result?.valid ? result.booking : undefined;
  const banner = BANNERS[booking && result?.timing ? result.timing : "invalid"];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Check booking</h1>

      {!result ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          Could not check this code. Please reload the page.
        </p>
      ) : (
        <div className={`rounded-xl border-2 p-4 ${banner.colour}`}>
          <p className="text-xl font-bold">{banner.title}</p>
          <p className="mt-1 text-base">
            {!booking && "This code is not a paid booking for one of your spaces."}
            {booking && result.timing === "current" && `Booked until ${formatTime(booking.end_time)} IST.`}
            {booking && result.timing === "upcoming" && `It starts ${formatWindow(booking.start_time, booking.end_time)}.`}
            {booking && result.timing === "over" && `It was for ${formatWindow(booking.start_time, booking.end_time)}.`}
          </p>
        </div>
      )}

      {booking && (
        <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base`}>
          {(
            [
              ["Space", booking.space_name],
              ["When", formatWindow(booking.start_time, booking.end_time)],
              ["Driver", booking.driver],
              ["Paid", formatRupees(booking.amount)],
              ["Reference", booking.reference],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="min-w-0 font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
