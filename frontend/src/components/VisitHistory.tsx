import { cardClass, inputClass, labelClass, secondaryButtonClass } from "@/components/ui";
import { formatDay, formatTime } from "@/lib/format";
import { describeOverstay } from "@/lib/overstay";
import type { Visit } from "@/lib/types";
import { VisitPhoto } from "./VisitPhoto";

// The incoming/outgoing vehicle log for one IST day, newest first, with a date
// picker. `action` is the page's own address (the picker is a plain GET form).
// The only amount shown is a visit's own overstay charge; no totals.
export function VisitHistory({
  action,
  date,
  visits,
}: {
  action: string;
  date: string;
  visits: Visit[] | null;
}) {
  return (
    <div className="flex flex-col gap-4">
      <form action={action} className={`${cardClass} flex flex-col gap-3 sm:flex-row sm:items-end`}>
        <label className={`${labelClass} sm:flex-1`}>
          Vehicles that entered on
          <input type="date" name="date" defaultValue={date} required className={inputClass} />
        </label>
        <button type="submit" className={secondaryButtonClass}>
          Show
        </button>
      </form>

      {!visits ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          Could not load the vehicle log. Please reload the page.
        </p>
      ) : visits.length === 0 ? (
        <p className="text-slate-600">No vehicles entered on {formatDay(date)}.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            {visits.length} {visits.length === 1 ? "vehicle" : "vehicles"} on {formatDay(date)} · times in IST
          </p>
          <ul className="flex flex-col gap-3">
            {visits.map((visit) => (
              <li key={visit.id} className={`${cardClass} flex items-start justify-between gap-3`}>
                <div className="flex min-w-0 flex-col gap-1">
                  <p className="text-lg font-semibold break-words">
                    {visit.vehicle_number ?? "Vehicle number not recorded"}
                  </p>
                  <p className="text-base">
                    <span className="font-medium">In</span> {formatTime(visit.entry_at)}
                    <span className="text-slate-500"> by {visit.entry_by}</span>
                  </p>
                  <p className="text-base">
                    {visit.exit_at ? (
                      <>
                        <span className="font-medium">Out</span> {formatTime(visit.exit_at)}
                        <span className="text-slate-500"> by {visit.exit_by}</span>
                      </>
                    ) : (
                      <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-sm font-medium text-emerald-800">
                        Inside
                      </span>
                    )}
                  </p>
                  {visit.exit_at && describeOverstay(visit) && (
                    <p className="text-base font-medium text-red-800">
                      {describeOverstay(visit)}
                      {visit.overstay_waive_reason && (
                        <span className="font-normal text-slate-600"> — {visit.overstay_waive_reason}</span>
                      )}
                    </p>
                  )}
                  <p className="text-sm break-words text-slate-600">
                    {visit.customer} · {visit.reference} · booked {formatTime(visit.start_time)} to{" "}
                    {formatTime(visit.end_time)}
                  </p>
                </div>
                <VisitPhoto visit={visit} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
