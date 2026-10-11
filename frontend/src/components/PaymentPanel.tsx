"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { openRazorpayCheckout, type RazorpaySuccess } from "@/lib/razorpay";
import type { PaymentInfo } from "@/lib/types";
import { errorClass, primaryButtonClass, secondaryButtonClass } from "./ui";

// What is being paid, and where the API calls and links for it go.
export interface PayTarget {
  amount: number;
  description: string; // shown in Razorpay Checkout
  apiBase: string; // confirm is POST `${apiBase}/confirm`, mock failure POST `${apiBase}/fail`
  doneHref: string; // where to go once paid
  dismissNote: string; // shown when Razorpay Checkout is closed without paying
  failedMessage: string; // shown after a failed mock payment
  backHref: string;
  backLabel: string;
}

// Pays for something (a booking or a rental invoice). In mock mode this is an
// in-app test screen; in razorpay mode it opens Razorpay Checkout. Both finish
// through the same `${apiBase}/confirm` call, where the API verifies the payment.
export function PaymentPanel({ target, payment }: { target: PayTarget; payment: PaymentInfo }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [failed, setFailed] = useState(false);

  async function confirm(body: object) {
    setError("");
    setBusy(true);
    try {
      await api(`${target.apiBase}/confirm`, { method: "POST", body });
      router.replace(target.doneHref);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment could not be confirmed");
      setBusy(false);
    }
  }

  // Mock mode only: report a failed payment.
  async function failMock() {
    setError("");
    setBusy(true);
    try {
      await api(`${target.apiBase}/fail`, { method: "POST" });
      setFailed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function payWithRazorpay() {
    setError("");
    setNotice("");
    if (!payment.key_id || !payment.order_id) {
      setError("The payment could not be started. Please try again.");
      return;
    }
    try {
      await openRazorpayCheckout(
        {
          key: payment.key_id,
          amount: Math.round(target.amount * 100),
          currency: payment.currency,
          name: "ParkSpotZ",
          description: target.description,
          order_id: payment.order_id,
          handler: (response: RazorpaySuccess) => confirm(response),
          modal: {
            ondismiss: () => setNotice(target.dismissNote),
          },
          theme: { color: "#059669" },
        },
        (message) => setError(`${message} You can try again.`)
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the payment window");
    }
  }

  if (failed) {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className={errorClass}>
          {target.failedMessage}
        </p>
        <Link href={target.backHref} className={secondaryButtonClass}>
          {target.backLabel}
        </Link>
      </div>
    );
  }

  const messages = (
    <>
      {notice && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{notice}</p>}
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
    </>
  );

  if (payment.mode === "razorpay") {
    return (
      <div className="flex flex-col gap-3">
        {messages}
        <button type="button" disabled={busy} onClick={payWithRazorpay} className={primaryButtonClass}>
          {busy ? "Confirming…" : `Pay ${formatRupees(target.amount)} with Razorpay`}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4">
      <p className="text-sm font-bold tracking-wide text-amber-900 uppercase">Test payment — no real money</p>
      <p className="text-sm text-amber-900">
        This stands in for a payment page. Choose how the payment should turn out.
      </p>
      {messages}
      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          disabled={busy}
          onClick={() => confirm({ mock_payment_id: `mock_pay_${Date.now().toString(36)}` })}
          className={primaryButtonClass}
        >
          Pay {formatRupees(target.amount)}
        </button>
        <button type="button" disabled={busy} onClick={failMock} className={secondaryButtonClass}>
          Fail the payment
        </button>
      </div>
    </div>
  );
}
