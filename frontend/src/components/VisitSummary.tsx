import { formatTime } from "@/lib/format";
import { describeOverstay } from "@/lib/overstay";
import type { Booking } from "@/lib/types";

// For the customer, once their vehicle has left: when it came and went, and
// any overstay charge settled at the gate.
export function VisitSummary({ booking }: { booking: Booking }) {
  const visit = booking.visit;
  if (!visit) return null;
  const overstay = describeOverstay(visit);
  return (
    <div className="text-sm text-slate-700">
      <p>
        Entered {formatTime(visit.entry_at)}, left {formatTime(visit.exit_at)} IST
      </p>
      {overstay && <p className="font-medium text-red-800">{overstay} at the gate</p>}
    </div>
  );
}
