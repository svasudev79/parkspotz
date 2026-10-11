import { capitalize } from "@/lib/format";
import { bookingState, type Booking } from "@/lib/types";

const COLOURS = {
  confirmed: "bg-emerald-100 text-emerald-800",
  "awaiting payment": "bg-amber-100 text-amber-900",
  expired: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
};

export function BookingStatus({ booking }: { booking: Booking }) {
  const state = bookingState(booking);
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium ${COLOURS[state]}`}>
      {capitalize(state)}
    </span>
  );
}
