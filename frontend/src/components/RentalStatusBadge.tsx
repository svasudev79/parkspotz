import type { RentalStatus } from "@/lib/types";

const STYLES: Record<RentalStatus, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-100 text-emerald-800" },
  due: { label: "Due", className: "bg-amber-100 text-amber-900" },
  overdue: { label: "Overdue", className: "bg-red-100 text-red-800" },
  free: { label: "Free first month", className: "bg-slate-200 text-slate-700" },
  none: { label: "No invoice", className: "bg-slate-200 text-slate-700" },
};

export function RentalStatusBadge({ status }: { status: RentalStatus }) {
  const style = STYLES[status];
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap ${style.className}`}>
      {style.label}
    </span>
  );
}

// The badge status of an invoice.
export function invoiceStatus(invoice: { status: "due" | "paid"; overdue: boolean }): RentalStatus {
  return invoice.status === "paid" ? "paid" : invoice.overdue ? "overdue" : "due";
}
