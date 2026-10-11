import type { Metadata } from "next";
import Link from "next/link";
import { invoiceStatus, RentalStatusBadge } from "@/components/RentalStatusBadge";
import { formatDate, formatMonth, formatRupees } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { RentalInvoice } from "@/lib/types";

export const metadata: Metadata = { title: "Rental · ParkSpotZ" };

interface OwnerRental {
  invoices: RentalInvoice[];
  summary: { due_count: number; overdue_count: number; due_amount: number };
}

// What the owner pays ParkSpotZ each month for hosting their spaces.
export default async function OwnerRentalPage() {
  await requireRole("owner");
  const data = await apiGet<OwnerRental>("/owner/rental");
  const invoices = data?.invoices ?? [];

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
              <h2 className="min-w-0 text-lg font-semibold break-words">{invoice.space_name}</h2>
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
