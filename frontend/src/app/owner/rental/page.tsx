import type { Metadata } from "next";
import Link from "next/link";
import { invoiceStatus, RentalStatusBadge } from "@/components/RentalStatusBadge";
import { formatDate, formatMonth, formatRupees } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { RentalInvoice, RentalTier } from "@/lib/types";

export const metadata: Metadata = { title: "Rental · ParkSpotZ" };

interface OwnerRental {
  tiers: RentalTier[];
  due_day: number;
  invoices: RentalInvoice[];
  summary: { due_count: number; overdue_count: number; due_amount: number };
}

// What the owner pays ParkSpotZ each month for hosting their spaces.
function slotRange(tier: RentalTier) {
  if (tier.max_slots === null) return `${tier.min_slots} or more`;
  if (tier.min_slots === tier.max_slots) return `${tier.min_slots}`;
  return `${tier.min_slots} to ${tier.max_slots}`;
}

export default async function OwnerRentalPage() {
  await requireRole("owner");
  const data = await apiGet<OwnerRental>("/owner/rental");
  const invoices = data?.invoices ?? [];
  const tiers = data?.tiers ?? [];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">Rental</h1>
        <p className="mt-1 text-slate-600">
          The monthly fee for listing each of your spaces on ParkSpotZ. It depends on the number of slots. The
          month you add a space is free.
        </p>
      </div>

      {!data && <p className="text-red-700">Could not load your invoices. Please refresh the page.</p>}

      {tiers.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-semibold">Monthly fees</h2>
          <table className="mt-2 w-full text-left text-base">
            <thead>
              <tr className="border-b border-slate-200 text-sm text-slate-600">
                <th className="py-2 pr-3 font-medium">Tier</th>
                <th className="py-2 pr-3 font-medium">Slots in the space</th>
                <th className="py-2 text-right font-medium">Fee per month</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.name} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3 font-medium">{tier.name}</td>
                  <td className="py-2 pr-3 text-slate-700">{slotRange(tier)}</td>
                  <td className="py-2 text-right font-semibold">{formatRupees(tier.monthly_fee)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-slate-600">
            Charged per listed space, each calendar month, and due on day {data?.due_day} of the month.
          </p>
        </section>
      )}

      {data && <h2 className="text-lg font-semibold">Your invoices</h2>}

      {data && data.summary.due_count > 0 && (
        <p
          className={`rounded-lg px-3 py-2 text-base font-medium ${
            data.summary.overdue_count > 0 ? "bg-red-50 text-red-800" : "bg-amber-50 text-amber-900"
          }`}
        >
          {formatRupees(data.summary.due_amount)} to pay across {data.summary.due_count}{" "}
          {data.summary.due_count === 1 ? "invoice" : "invoices"}
          {data.summary.overdue_count > 0 && ` · ${data.summary.overdue_count} overdue`}
        </p>
      )}
      {data && invoices.length === 0 && <p className="text-slate-600">No invoices yet.</p>}

      <ul className="flex flex-col gap-3">
        {invoices.map((invoice) => (
          <li
            key={invoice.id}
            className={`flex flex-col gap-2 rounded-xl border p-4 ${
              invoice.overdue ? "border-red-400 bg-red-50" : "border-slate-200 bg-white"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h3 className="min-w-0 text-lg font-semibold break-words">{invoice.space_name}</h3>
              <RentalStatusBadge status={invoiceStatus(invoice)} />
            </div>
            <p className="text-sm text-slate-700">
              {formatMonth(invoice.month)} · {invoice.tier_name} tier ({invoice.slots} slots)
            </p>
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">{formatRupees(invoice.amount)}</span> ·{" "}
              {invoice.paid_at ? `paid ${formatDate(invoice.paid_at)}` : `due ${formatDate(invoice.due_date)}`} ·{" "}
              {invoice.reference}
            </p>
            <Link
              href={`/owner/rental/${invoice.id}`}
              className={
                invoice.status === "due"
                  ? "inline-flex h-11 items-center self-start rounded-lg bg-emerald-600 px-5 text-base font-semibold text-white hover:bg-emerald-700"
                  : "inline-flex h-11 items-center self-start rounded-lg text-base font-semibold text-emerald-700 underline"
              }
            >
              {invoice.status === "due" ? "Pay" : "View receipt"}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
