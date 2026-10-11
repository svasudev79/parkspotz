import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GatePanel } from "@/components/GatePanel";
import { cardClass } from "@/components/ui";
import { formatRupees, formatTime, formatWindow } from "@/lib/format";
import { formatDuration } from "@/lib/overstay";
import { apiGet, getCurrentUser } from "@/lib/session";
import type { GateView } from "@/lib/types";

export const metadata: Metadata = { title: "Check booking · ParkSpotZ" };

const BANNERS = {
  current: { title: "Valid — let them in", colour: "border-emerald-600 bg-emerald-50 text-emerald-900" },
  upcoming: { title: "Valid, but not started yet", colour: "border-amber-500 bg-amber-50 text-amber-900" },
  over: { title: "This booking has ended", colour: "border-red-500 bg-red-50 text-red-900" },
  inside: { title: "Vehicle is inside", colour: "border-emerald-600 bg-emerald-50 text-emerald-900" },
  used: { title: "Already used", colour: "border-red-500 bg-red-50 text-red-900" },
  invalid: { title: "Not valid", colour: "border-red-500 bg-red-50 text-red-900" },
};

function minutesBetween(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 60_000;
}

// The page a receipt's QR code opens. The space's owner and its attendants see
// whether the booking is valid and record the vehicle's entry and exit here.
// Everyone else is asked to log in with a staff account.
export default async function VerifyPage(props: PageProps<"/verify/[qrToken]">) {
  const { qrToken } = await props.params;
  const here = `/verify/${encodeURIComponent(qrToken)}`;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  if (user.role === "customer") {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6">
        <h1 className="text-2xl font-bold">Staff only</h1>
        <p className="text-slate-700">
          This link is for the parking space&apos;s owner and attendants to check a booking at the entrance.
          Your receipts are under My bookings.
        </p>
      </main>
    );
  }

  const view = await apiGet<GateView>(here);
  const booking = view?.valid ? view.booking : undefined;
  const visit = view?.visit ?? null;
  const state = !booking ? "invalid" : visit ? (visit.exit_at ? "used" : "inside") : (view?.timing ?? "invalid");
  const banner = BANNERS[state];

  // Attendants never see what was paid.
  const facts: [string, string][] = booking
    ? [
        ["Space", booking.space_name],
        ["When", formatWindow(booking.start_time, booking.end_time)],
        ["Allotted", formatDuration(minutesBetween(booking.start_time, booking.end_time))],
        ["Customer", booking.customer],
        ...(booking.amount !== undefined ? ([["Paid", formatRupees(booking.amount)]] as [string, string][]) : []),
        ["Reference", booking.reference],
      ]
    : [];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Check booking</h1>

      {!view ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          Could not check this code. Please reload the page.
        </p>
      ) : (
        <div className={`rounded-xl border-2 p-4 ${banner.colour}`}>
          <p className="text-xl font-bold">{banner.title}</p>
          <p className="mt-1 text-base">
            {!booking && "This code is not a paid booking for your parking space."}
            {booking && state === "current" && `Booked until ${formatTime(booking.end_time)} IST.`}
            {booking && state === "upcoming" && `It is for ${formatWindow(booking.start_time, booking.end_time)}.`}
            {booking && state === "over" && `It was for ${formatWindow(booking.start_time, booking.end_time)}.`}
            {booking && visit && state === "inside" && `Entered at ${formatTime(visit.entry_at)} IST.`}
            {booking &&
              visit?.exit_at &&
              `Entered ${formatTime(visit.entry_at)}, left ${formatTime(visit.exit_at)} IST. It cannot be used again.`}
          </p>
        </div>
      )}

      {booking && (
        <dl className={`${cardClass} grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base`}>
          {facts.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="min-w-0 font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {view?.valid && <GatePanel qrToken={qrToken} view={view} />}
    </main>
  );
}
