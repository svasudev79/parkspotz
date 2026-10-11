import type { Metadata } from "next";
import Link from "next/link";
import { CustomerName } from "@/components/CustomerName";
import { ExitControl } from "@/components/ExitControl";
import { ReferenceLookup } from "@/components/ReferenceLookup";
import { TimeLeft } from "@/components/TimeLeft";
import { VisitPhoto } from "@/components/VisitPhoto";
import { cardClass } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { GateHome } from "@/lib/types";

export const metadata: Metadata = { title: "Gate · ParkSpotZ" };

// The attendant's home screen, for one parking space. Phone-first. No amounts.
export default async function AttendantPage() {
  await requireRole("attendant");
  const home = await apiGet<GateHome>("/gate/home");

  if (!home) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-6">
        <h1 className="text-2xl font-bold">Gate</h1>
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          Could not load your parking space. If this keeps happening, ask the space owner to check your account.
        </p>
      </main>
    );
  }
  const { space, inside, expected } = home;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold break-words">{space.name}</h1>
        <p className="mt-1 text-slate-600 break-words">{space.address}</p>
        <p className="mt-1 text-sm text-slate-600">
          Open {space.open_time}–{space.close_time} · {inside.length} of {space.total_slots} slots in use
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Inside now ({inside.length})</h2>
        {inside.length === 0 ? (
          <p className="text-slate-600">No vehicles are inside.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {inside.map((visit) => (
              <li key={visit.id} className={`${cardClass} flex flex-col gap-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="text-lg font-semibold break-words">
                      {visit.vehicle_number ?? "Vehicle number not recorded"}
                    </p>
                    <p className="text-base text-slate-700">Entered at {formatTime(visit.entry_at)}</p>
                    <p className="text-sm break-words text-slate-600">
                      <CustomerName name={visit.customer} guest={visit.is_guest} /> · {visit.reference}
                    </p>
                  </div>
                  <VisitPhoto visit={visit} />
                </div>
                <TimeLeft visit={visit} now={home.now} />
                <ExitControl visit={visit} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Expected today ({expected.length})</h2>
        {expected.length === 0 ? (
          <p className="text-slate-600">No more paid bookings are due to arrive today.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {expected.map((booking) => (
              <li key={booking.reference}>
                <Link
                  href={`/verify/${encodeURIComponent(booking.qr_token)}`}
                  className={`${cardClass} flex min-h-14 items-center justify-between gap-3 hover:bg-slate-50`}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold">
                      {formatTime(booking.start_time)} to {formatTime(booking.end_time)}
                    </span>
                    <span className="text-sm break-words text-slate-600">
                      <CustomerName name={booking.customer} guest={booking.is_guest} /> · {booking.reference}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold text-emerald-700">Check ›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={`${cardClass} flex flex-col gap-3`}>
        <h2 className="text-lg font-semibold">Check a booking</h2>
        <p className="text-base text-slate-700">
          Scan the QR code on the customer&apos;s receipt with this phone&apos;s camera. It opens the check screen,
          where you record the entry.
        </p>
        <p className="text-base text-slate-700">If the code will not scan, type the reference from the receipt:</p>
        <ReferenceLookup />
      </section>
    </main>
  );
}
