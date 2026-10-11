import type { Metadata } from "next";
import { cardClass, errorClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { capitalize, formatDay, formatRupees, todayInIst } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { OwnerStats, Space } from "@/lib/types";

export const metadata: Metadata = { title: "Stats · ParkSpotZ" };

const PERIODS = ["day", "week", "month"] as const;

// Usage and revenue per space. The filters are a plain GET form, so the
// chosen period, space and date live in the page address.
export default async function OwnerStatsPage(props: PageProps<"/owner/stats">) {
  await requireRole("owner");
  const query = await props.searchParams;
  const text = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");

  const period = PERIODS.find((p) => p === text("period")) ?? "day";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(text("date")) ? text("date") : todayInIst();
  const spaceId = /^\d+$/.test(text("spaceId")) ? text("spaceId") : "";

  const params = new URLSearchParams({ period, date });
  if (spaceId) params.set("spaceId", spaceId);
  const [stats, owned] = await Promise.all([
    apiGet<OwnerStats>(`/owner/stats?${params}`),
    apiGet<{ spaces: Space[] }>("/owner/spaces"),
  ]);
  const spaces = owned?.spaces ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-bold">Usage and revenue</h1>

      <form action="/owner/stats" className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-4 sm:items-end`}>
        <label className={labelClass}>
          Period
          <select name="period" defaultValue={period} className={inputClass}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {capitalize(p)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Containing date
          <input type="date" name="date" defaultValue={date} required className={inputClass} />
        </label>
        <label className={labelClass}>
          Space
          <select name="spaceId" defaultValue={spaceId} className={inputClass}>
            <option value="">All my spaces</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={primaryButtonClass}>
          Show
        </button>
      </form>

      {!stats ? (
        <p role="alert" className={errorClass}>
          Could not load the stats. Check the filters and try again.
        </p>
      ) : stats.spaces.length === 0 ? (
        <p className="text-slate-600">You have no parking spaces yet. Add one under My spaces.</p>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Paid bookings that start{" "}
            {stats.from === stats.to || !stats.from || !stats.to
              ? `on ${formatDay(stats.from ?? date)}`
              : `from ${formatDay(stats.from)} to ${formatDay(stats.to)}`}{" "}
            (IST).
          </p>
          <div className={`${cardClass} overflow-x-auto p-0`}>
            <table className="w-full text-left text-base">
              <thead className="border-b border-slate-200 text-sm text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Space</th>
                  <th className="px-3 py-3 text-right font-medium">Bookings</th>
                  <th className="px-3 py-3 text-right font-medium">Hours</th>
                  <th className="px-4 py-3 text-right font-medium">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {stats.spaces.map((row) => (
                  <tr key={row.space_id} className="border-b border-slate-100">
                    <td className="px-4 py-3 break-words">{row.space_name}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.bookings}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{row.hours}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatRupees(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="px-4 py-3">Total</td>
                  <td className="px-3 py-3 text-right tabular-nums">{stats.total.bookings}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{stats.total.hours}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatRupees(stats.total.revenue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  );
}
