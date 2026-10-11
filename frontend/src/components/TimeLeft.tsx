"use client";

import { formatRupees, formatTime } from "@/lib/format";
import { formatDuration, overstayEstimate } from "@/lib/overstay";
import type { Visit } from "@/lib/types";
import { useServerNow } from "./useServerNow";

// Live countdown to a parked vehicle's booked end time. Once the end has
// passed it turns into an overstay notice with the charge accrued so far.
// For display only: the charge is fixed by the API when exit is recorded.
export function TimeLeft({ visit, now }: { visit: Visit; now: string }) {
  const current = useServerNow(now);
  const end = new Date(visit.end_time).getTime();
  const minutesLeft = Math.ceil((end - current) / 60_000);

  if (minutesLeft > 0) {
    const soon = minutesLeft <= 15;
    return (
      <p
        className={`rounded-lg px-3 py-2 text-base font-semibold ${
          soon ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-900"
        }`}
      >
        {formatDuration(minutesLeft)} left
        <span className="font-normal"> · booked until {formatTime(visit.end_time)}</span>
      </p>
    );
  }

  const lateMinutes = Math.floor((current - end) / 60_000);
  const due = overstayEstimate(lateMinutes, visit.overstay_rule);
  if (due === 0) {
    return (
      <p className="rounded-lg bg-amber-100 px-3 py-2 text-base font-semibold text-amber-900">
        Time is up{lateMinutes > 0 ? ` · ${formatDuration(lateMinutes)} over` : ""}
        <span className="font-normal">
          {" "}
          · no charge for the first {visit.overstay_rule.grace_minutes} min
        </span>
      </p>
    );
  }
  return (
    <p className="rounded-lg border-2 border-red-500 bg-red-50 px-3 py-2 text-base font-bold text-red-800">
      Overstayed by {formatDuration(lateMinutes)}
      <span className="font-semibold"> · {formatRupees(due)} due</span>
    </p>
  );
}
