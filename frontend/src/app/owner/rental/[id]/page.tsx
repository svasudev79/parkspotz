import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/PrintButton";
import { RentalPay } from "@/components/RentalPay";
import { invoiceStatus, RentalStatusBadge } from "@/components/RentalStatusBadge";
import { cardClass } from "@/components/ui";
import { formatDate, formatMonth, formatRupees } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { RentalInvoice } from "@/lib/types";

export const metadata: Metadata = { title: "Rental invoice · ParkSpotZ" };

// One rental invoice: pay it while it is due, a receipt once it is paid.
export default async function RentalInvoicePage(props: PageProps<"/owner/rental/[id]">) {
  await requireRole("owner");
  const { id } = await props.params;
  const data = await apiGet<{ invoice: RentalInvoice }>(`/owner/rental/invoices/${encodeURIComponent(id)}`);
  if (!data) notFound();
  const { invoice } = data;
  const paid = invoice.status === "paid";

  const rows: [string, string][] = [
    ["Space", invoice.space_name],
    ["Month", formatMonth(invoice.month)],
    ["Tier", `${invoice.tier_name} (${invoice.slots} slots)`],
    ["Amount", formatRupees(invoice.amount)],
    paid && invoice.paid_at ? ["Paid on", formatDate(invoice.paid_at)] : ["Due", formatDate(invoice.due_date)],
    ["Reference", invoice.reference],
  ];

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <Link href="/owner/rental" className="self-start py-3 text-sm font-medium text-emerald-700 underline print:hidden">
        ← Rental
      </Link>

      <article className={`${cardClass} flex flex-col gap-4 print:border-0 print:p-0`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-bold">{paid ? "Rental receipt" : "Rental invoice"}</h1>
          <RentalStatusBadge status={invoiceStatus(invoice)} />
        </div>
        <p className="hidden text-sm text-slate-600 print:block">ParkSpotZ</p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-base">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-slate-500">{label}</dt>
              <dd className="min-w-0 font-medium break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </article>

      {paid ? <PrintButton /> : <RentalPay invoice={invoice} />}
    </main>
  );
}
