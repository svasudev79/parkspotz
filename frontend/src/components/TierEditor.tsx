"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { RentalTier } from "@/lib/types";
import { errorClass, inputClass, primaryButtonClass, secondaryButtonClass } from "./ui";

type Row = { name: string; min_slots: string; max_slots: string; monthly_fee: string };

const toRow = (tier: RentalTier): Row => ({
  name: tier.name,
  min_slots: String(tier.min_slots),
  max_slots: tier.max_slots === null ? "" : String(tier.max_slots),
  monthly_fee: String(tier.monthly_fee),
});

// Admin's editor for the rental tiers. The whole set is saved at once; the
// API refuses it if the tiers overlap, leave a gap, or do not start at 1.
// Invoices that already exist keep their amount.
export function TierEditor({ tiers }: { tiers: RentalTier[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(tiers.map(toRow));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function change(index: number, key: keyof Row, value: string) {
    setSaved(false);
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setBusy(true);
    try {
      const data = await api<{ tiers: RentalTier[] }>("/admin/rental/tiers", {
        method: "PUT",
        body: {
          tiers: rows.map((row) => ({
            name: row.name,
            min_slots: Number(row.min_slots),
            max_slots: row.max_slots.trim() === "" ? null : Number(row.max_slots),
            monthly_fee: Number(row.monthly_fee),
          })),
        },
      });
      setRows(data.tiers.map(toRow));
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the tiers");
    }
    setBusy(false);
  }

  const fieldClass = `${inputClass} h-11 px-2`;

  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <li key={index} className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
            <label className="col-span-2 flex flex-col gap-1 text-sm font-medium sm:col-span-1">
              Name
              <input className={fieldClass} required maxLength={40} value={row.name} onChange={(e) => change(index, "name", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              From (slots)
              <input className={fieldClass} type="number" min={1} step={1} required value={row.min_slots} onChange={(e) => change(index, "min_slots", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              To (blank = no limit)
              <input className={fieldClass} type="number" min={1} step={1} value={row.max_slots} onChange={(e) => change(index, "max_slots", e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Fee per month (₹)
              <input className={fieldClass} type="number" min={0} step="any" required value={row.monthly_fee} onChange={(e) => change(index, "monthly_fee", e.target.value)} />
            </label>
            <button
              type="button"
              disabled={rows.length === 1}
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
              className="h-11 rounded-lg border border-red-300 px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}
      {saved && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Tiers saved.</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Saving…" : "Save tiers"}
        </button>
        <button
          type="button"
          onClick={() => setRows((current) => [...current, { name: "", min_slots: "", max_slots: "", monthly_fee: "" }])}
          className={secondaryButtonClass}
        >
          Add a tier
        </button>
      </div>
    </form>
  );
}
