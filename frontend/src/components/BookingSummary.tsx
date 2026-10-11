import { formatHours, formatRupees, formatWindow } from "@/lib/format";
import type { Booking } from "@/lib/types";

// The facts of a booking, as shown on the payment and receipt pages.
export function BookingSummary({ booking }: { booking: Booking }) {
  const hours = (new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()) / 3_600_000;
  const rows: [string, string][] = [
    ["Space", booking.space_name],
    ["Address", booking.space_address],
    ["When", formatWindow(booking.start_time, booking.end_time)],
    ["Duration", formatHours(hours)],
    ["Amount", formatRupees(booking.amount)],
    ["Reference", booking.reference],
  ];
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500">{label}</dt>
          <dd className="min-w-0 font-medium break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
