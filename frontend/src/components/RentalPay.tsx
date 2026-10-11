"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatMonth, formatRupees } from "@/lib/format";
import type { PaymentInfo, RentalInvoice } from "@/lib/types";
import { PaymentPanel } from "./PaymentPanel";
import { errorClass, primaryButtonClass } from "./ui";

// Pays one rental invoice. Pressing Pay asks the API to start a payment; the
// rest is the same payment screen that bookings use.
export function RentalPay({ invoice }: { invoice: RentalInvoice }) {
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setError("");
    setBusy(true);
    try {
      const data = await api<{ payment: PaymentInfo }>(`/owner/rental/invoices/${invoice.id}/pay`, { method: "POST" });
      setPayment(data.payment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment");
    }
    setBusy(false);
  }

  if (payment) {
    return (
      <PaymentPanel
        payment={payment}
        target={{
          amount: invoice.amount,
          description: `${invoice.reference} · ${invoice.space_name} · ${formatMonth(invoice.month)}`,
          apiBase: `/owner/rental/invoices/${invoice.id}`,
          doneHref: `/owner/rental/${invoice.id}`,
          dismissNote: "Payment not completed. The invoice is still due.",
          failedMessage: "Payment failed. The invoice is still due; you can try again.",
          backHref: "/owner/rental",
          backLabel: "Back to rental",
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      <button type="button" disabled={busy} onClick={start} className={primaryButtonClass}>
        {busy ? "Starting…" : `Pay ${formatRupees(invoice.amount)}`}
      </button>
    </div>
  );
}
