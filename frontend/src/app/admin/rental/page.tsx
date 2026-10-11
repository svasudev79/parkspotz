import type { Metadata } from "next";
import { invoiceStatus, RentalStatusBadge } from "@/components/RentalStatusBadge";
import { TierEditor } from "@/components/TierEditor";
import { cardClass, inputClass, labelClass, primaryButtonClass } from "@/components/ui";
import { formatDate, formatMonth, formatRupees } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { AdminRental } from "@/lib/types";

export const metadata: Metadata = { title: "Rental · ParkSpotZ admin" };

const STATUSES = [
  ["all", "All"],
  ["due", "Due (including overdue)"],
  ["overdue", "Overdue only"],
  ["paid", "Paid"],
] as const;

// Rental tiers and invoices for the admin. Non-payment is only flagged here;
// nothing is hidden or blocked, and the admin cannot mark an invoice paid.
export default async function AdminRentalPage(props: PageProps<"/admin/rental">) {
  await requireRole("admin");
  const query = await props.searchParams;
  const month = typeof query.month === "string" && /^\d{4}-\d{2}$/.test(query.month) ? query.month : "";
  const status = STATUSES.find(([value]) => value === query.status)?.[0] ?? "all";
  const params = new URLSearchParams({ status });
  if (month) params.set("month", month);
  const data = await apiGet<AdminRental>(`/admin/rental?${params}`);

  if (!data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-bold">Rental</h1>
        <p className="mt-4 text-red-700">Could not load the rental data. Please refresh the page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      <h1 className="text-2xl font-bold">Rental</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Invoices · {formatMonth(data.month)}</h2>
        <form action="/admin/rental" className={`${cardClass} grid grid-cols-1 gap-4 sm:grid-cols-3 sm:items-end`}>
          <label className={labelClass}>
            Month
            <input type="month" name="month" defaultValue={data.month} className={inputClass} />
          </label>
          <label className={labelClass}>
            Status
            <select name="status" defaultValue={status} className={inputClass}>
              {STATUSES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className={primaryButtonClass}>
            Show
          </button>
        </form>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Invoiced", `${formatRupees(data.totals.invoiced)}`, `${data.totals.invoices} invoices`],
              ["Collected", formatRupees(data.totals.collected), ""],
              ["Outstanding", formatRupees(data.totals.outstanding), ""],
              ["Overdue", String(data.totals.overdue_count), "invoices this month"],
            ] as const
          ).map(([label, value, note]) => (
            <div key={label} className={`${cardClass} flex flex-col gap-1`}>
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="text-xl font-bold tabular-nums">{value}</dd>
              {note && <dd className="text-sm text-slate-600">{note}</dd>}
            </div>
          ))}
        </dl>

        {data.invoices.length === 0 ? (
          <p className="text-slate-600">No invoices match.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {data.invoices.map((invoice) => (
              <li
                key={invoice.id}
                className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border p-4 ${
                  invoice.overdue ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
                }`}
              >
                <div className="min-w-0">
                  <p className="font-semibold break-words">{invoice.space_name}</p>
                  <p className="text-sm break-words text-slate-600">
                    Owner: {invoice.owner} · {invoice.tier_name} ({invoice.slots} slots) · {invoice.reference}
                  </p>
                  <p className="text-sm text-slate-600">
                    {invoice.paid_at ? `Paid ${formatDate(invoice.paid_at)}` : `Due ${formatDate(invoice.due_date)}`}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-semibold tabular-nums">{formatRupees(invoice.amount)}</span>
                  <RentalStatusBadge status={invoiceStatus(invoice)} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Tiers</h2>
        <p className="text-sm text-slate-600">
          The monthly fee by number of slots. Tiers must start at 1 slot and follow on without gaps or overlaps;
          the last one has no upper limit. Changes apply to invoices made from now on.
        </p>
        <div className={cardClass}>
          <TierEditor tiers={data.tiers} />
        </div>
      </section>
    </main>
  );
}
