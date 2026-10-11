"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { formatRupees } from "@/lib/format";
import { describeRule, formatDuration } from "@/lib/overstay";
import type { Visit } from "@/lib/types";
import { errorClass, gateButtonClass, gateExitButtonClass, inputClass, labelClass, secondaryButtonClass } from "./ui";

type Due = { minutes: number; amount: number };
type Settlement = "cash" | "upi" | "waived";

const CHOICES: { value: Settlement; label: string }[] = [
  { value: "cash", label: "Collected — cash" },
  { value: "upi", label: "Collected — UPI" },
  { value: "waived", label: "Waived" },
];

// "Record exit". A vehicle leaving on time is one tap. If the API says an
// overstay charge is due, the attendant first sees the amount and must choose
// how it was settled. The API works out the charge; this only shows it.
export function ExitControl({ visit }: { visit: Visit }) {
  const router = useRouter();
  const [due, setDue] = useState<Due | null>(null);
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // The API's answer when it refuses an exit includes what is due right now.
  function dueFrom(err: unknown): Due | null {
    const data = err instanceof ApiError ? (err.data as { overstay?: Due } | null) : null;
    return data?.overstay && data.overstay.amount > 0 ? data.overstay : null;
  }

  async function exit(body: object) {
    await api(`/visits/${visit.id}/exit`, { method: "POST", body });
    router.refresh();
  }

  // First tap: ask the server what is due. Nothing due -> record the exit.
  async function start() {
    setError("");
    setBusy(true);
    try {
      const fresh = (await api<{ visit: Visit }>(`/visits/${visit.id}`)).visit;
      if (fresh.exit_at) router.refresh();
      else if (fresh.overstay_amount > 0) setDue({ minutes: fresh.overstay_minutes, amount: fresh.overstay_amount });
      else await exit({});
    } catch (err) {
      const nowDue = dueFrom(err);
      if (nowDue) setDue(nowDue);
      else setError(err instanceof Error ? err.message : "Could not record the exit");
      if (!nowDue) router.refresh();
    }
    setBusy(false);
  }

  async function settle() {
    if (!due || !settlement) return;
    setError("");
    setBusy(true);
    try {
      await exit({ settlement, waive_reason: reason, amount_shown: due.amount });
    } catch (err) {
      const nowDue = dueFrom(err);
      if (nowDue) setDue(nowDue); // the charge grew while this screen was open
      setError(err instanceof Error ? err.message : "Could not record the exit");
    }
    setBusy(false);
  }

  const alert = error && (
    <p role="alert" className={errorClass}>
      {error}
    </p>
  );

  if (!due) {
    return (
      <div className="flex flex-col gap-2">
        <button type="button" disabled={busy} onClick={start} className={gateExitButtonClass}>
          {busy ? "Checking…" : "Record exit"}
        </button>
        {alert}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border-2 border-red-500 bg-red-50 p-4">
      <div>
        <p className="text-base font-semibold text-red-900">Overstayed by {formatDuration(due.minutes)}</p>
        <p className="text-3xl font-bold text-red-900">{formatRupees(due.amount)} due</p>
        <p className="mt-1 text-sm text-red-900">{describeRule(visit.overstay_rule)}</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-slate-900">How was it settled?</legend>
        {CHOICES.map((choice) => (
          <label
            key={choice.value}
            className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 bg-white px-4 text-lg font-medium ${
              settlement === choice.value ? "border-slate-900" : "border-slate-300"
            }`}
          >
            <input
              type="radio"
              name={`settlement-${visit.id}`}
              className="h-5 w-5 accent-slate-900"
              checked={settlement === choice.value}
              onChange={() => setSettlement(choice.value)}
            />
            {choice.label}
          </label>
        ))}
      </fieldset>

      {settlement === "waived" && (
        <label className={labelClass}>
          Reason for waiving
          <input
            className={inputClass}
            required
            maxLength={200}
            placeholder="e.g. exit was blocked"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      )}

      {alert}

      <button
        type="button"
        disabled={busy || !settlement || (settlement === "waived" && reason.trim().length < 3)}
        onClick={settle}
        className={gateButtonClass}
      >
        {busy ? "Saving…" : "Confirm and record exit"}
      </button>
      <button type="button" disabled={busy} onClick={() => setDue(null)} className={secondaryButtonClass}>
        Not leaving yet
      </button>
    </div>
  );
}
