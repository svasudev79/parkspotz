"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatDateTime, formatTime } from "@/lib/format";
import { uploadVisitPhoto } from "@/lib/image";
import type { GateView, Visit } from "@/lib/types";
import { describeOverstay } from "@/lib/overstay";
import { ExitControl } from "./ExitControl";
import { PhotoInput } from "./PhotoInput";
import { TimeLeft } from "./TimeLeft";
import { VisitPhoto } from "./VisitPhoto";
import { cardClass, errorClass, gateButtonClass, inputClass, labelClass } from "./ui";

// The actions under a checked booking: record entry (with an optional vehicle
// number and photo), then record exit. After exit nothing more can be done:
// a booking is good for one visit.
export function GatePanel({ qrToken, view }: { qrToken: string; view: GateView }) {
  const router = useRouter();
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const visit = view.visit ?? null;

  async function recordEntry(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { visit: created } = await api<{ visit: Visit }>("/visits", {
        method: "POST",
        body: { qr_token: qrToken, vehicle_number: vehicleNumber },
      });
      if (photo) {
        // The entry is already saved; a failed photo can be retried afterwards.
        await uploadVisitPhoto(created.id, photo).catch((err: Error) =>
          setError(`Entry recorded, but the photo was not saved: ${err.message}`)
        );
      }
      setPhoto(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record the entry");
    }
    router.refresh();
    setBusy(false);
  }

  async function savePhoto(visitId: number, file: File | null) {
    if (!file) return;
    setError("");
    setBusy(true);
    try {
      await uploadVisitPhoto(visitId, file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo could not be saved");
    }
    router.refresh();
    setBusy(false);
  }

  const alert = error && (
    <p role="alert" className={errorClass}>
      {error}
    </p>
  );

  // Not entered yet.
  if (!visit) {
    if (!view.can_enter) {
      return view.timing === "upcoming" && view.entry_opens_at ? (
        <p className={`${cardClass} text-base text-slate-700`}>
          Entry can be recorded from {formatDateTime(view.entry_opens_at)} IST.
        </p>
      ) : null;
    }
    return (
      <form onSubmit={recordEntry} className={`${cardClass} flex flex-col gap-4`}>
        <h2 className="text-lg font-semibold">Record entry</h2>
        <label className={labelClass}>
          Vehicle number (optional)
          <input
            className={`${inputClass} uppercase`}
            placeholder="KA 01 AB 1234"
            autoCapitalize="characters"
            autoComplete="off"
            maxLength={20}
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
          />
        </label>
        <PhotoInput file={photo} label="Take a photo of the vehicle (optional)" disabled={busy} onChange={setPhoto} />
        {alert}
        <button type="submit" disabled={busy} className={gateButtonClass}>
          {busy ? "Saving…" : "Record entry"}
        </button>
      </form>
    );
  }

  // Entered: show the visit, and the exit action while the vehicle is inside.
  return (
    <section className={`${cardClass} flex flex-col gap-4`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {visit.exit_at ? "Already used" : `Entered at ${formatTime(visit.entry_at)}`}
          </h2>
          <p className="text-base text-slate-700">
            Entered {formatDateTime(visit.entry_at)} · recorded by {visit.entry_by}
          </p>
          {visit.exit_at && (
            <p className="text-base text-slate-700">
              Left {formatDateTime(visit.exit_at)} · recorded by {visit.exit_by}
            </p>
          )}
          {visit.exit_at && describeOverstay(visit) && (
            <p className="text-base font-semibold text-red-800">
              {describeOverstay(visit)}
              {visit.overstay_waive_reason && (
                <span className="font-normal text-slate-700"> — {visit.overstay_waive_reason}</span>
              )}
            </p>
          )}
          <p className="text-base text-slate-700">
            Vehicle: <span className="font-semibold">{visit.vehicle_number ?? "not recorded"}</span>
          </p>
        </div>
        <VisitPhoto visit={visit} size="h-24 w-24" />
      </div>

      {!visit.exit_at && view.now && <TimeLeft visit={visit} now={view.now} />}

      {alert}

      {visit.exit_at ? (
        <p className="text-base text-slate-700">This booking cannot be used again.</p>
      ) : (
        <>
          <PhotoInput
            file={null}
            label={busy ? "Saving photo…" : visit.has_photo ? "Replace the photo" : "Add a photo of the vehicle"}
            disabled={busy}
            onChange={(file) => savePhoto(visit.id, file)}
          />
          <ExitControl visit={visit} />
        </>
      )}
    </section>
  );
}
