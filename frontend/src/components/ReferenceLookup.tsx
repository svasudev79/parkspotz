"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { errorClass, inputClass, labelClass, secondaryButtonClass } from "./ui";

// Finds a booking by the reference printed on the receipt (PSZ-000123), for
// when the QR code will not scan, and opens its check screen.
export function ReferenceLookup() {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { qr_token } = await api<{ qr_token: string }>(`/gate/lookup?reference=${encodeURIComponent(reference)}`);
      router.push(`/verify/${encodeURIComponent(qr_token)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not look up that reference");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={lookup} className="flex flex-col gap-3">
      <label className={labelClass}>
        Booking reference
        <input
          className={`${inputClass} uppercase`}
          placeholder="PSZ-000123"
          autoCapitalize="characters"
          autoComplete="off"
          required
          maxLength={20}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={secondaryButtonClass}>
        {busy ? "Looking…" : "Find booking"}
      </button>
    </form>
  );
}
