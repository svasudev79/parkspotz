"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { capitalize } from "@/lib/format";
import { HAS_MAPS_KEY } from "@/lib/googleMaps";
import type { Place } from "@/lib/landmarks";
import { OWNERSHIPS, SPACE_TYPES, type Space } from "@/lib/types";
import { DestinationInput } from "./DestinationInput";
import { PinMap } from "./PinMap";
import { errorClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./ui";

// Add form when `space` is missing, edit form when it is given.
export function SpaceForm({ space }: { space?: Space }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: space?.name ?? "",
    address: space?.address ?? "",
    lat: space ? String(space.lat) : "",
    lng: space ? String(space.lng) : "",
    space_type: space?.space_type ?? "surface",
    ownership: space?.ownership ?? "private",
    total_slots: space ? String(space.total_slots) : "",
    price_per_hour: space ? String(space.price_per_hour) : "",
    open_time: space?.open_time ?? "08:00",
    close_time: space?.close_time ?? "22:00",
    is_active: space?.is_active ?? true,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  // A place picked from search fills the coordinates, and the address if empty
  // (or always, when Google supplies a full address).
  function applyPlace(place: Place) {
    setForm((current) => ({
      ...current,
      lat: place.lat.toFixed(6),
      lng: place.lng.toFixed(6),
      address: place.address ?? (current.address || place.name),
    }));
  }

  const lat = Number(form.lat);
  const lng = Number(form.lng);
  const hasPosition = form.lat !== "" && form.lng !== "" && Number.isFinite(lat) && Number.isFinite(lng);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!hasPosition) {
      setError("Set the location: pick a place or enter latitude and longitude.");
      return;
    }
    setBusy(true);
    const body = {
      ...form,
      lat,
      lng,
      total_slots: Number(form.total_slots),
      price_per_hour: Number(form.price_per_hour),
    };
    try {
      if (space) await api(`/spaces/${space.id}`, { method: "PATCH", body });
      else await api("/spaces", { method: "POST", body });
      router.push("/owner/spaces");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
      <label className={labelClass}>
        Name
        <input
          className={inputClass}
          required
          maxLength={100}
          placeholder="e.g. Sunrise Basement Parking"
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
        />
      </label>

      <fieldset className="flex min-w-0 flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold">Location</legend>

        <div className={labelClass}>
          <label htmlFor="space-place">{HAS_MAPS_KEY ? "Search for the address" : "Start from a nearby landmark"}</label>
          <DestinationInput id="space-place" onPick={applyPlace} />
          {!HAS_MAPS_KEY && (
            <span className="font-normal text-slate-500">
              This fills in the coordinates below. Adjust them to the exact spot if you know it.
            </span>
          )}
        </div>

        {HAS_MAPS_KEY && (
          <div className="flex flex-col gap-1">
            <PinMap
              position={hasPosition ? { lat, lng } : null}
              onMove={(p) => setForm((c) => ({ ...c, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }))}
            />
            <span className="text-sm text-slate-500">Drag the pin, or tap the map, to mark the entrance.</span>
          </div>
        )}

        <label className={labelClass}>
          Address
          <input
            className={inputClass}
            required
            maxLength={300}
            placeholder="Street, area, Bengaluru"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className={labelClass}>
            Latitude
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              step="any"
              min={-90}
              max={90}
              required
              value={form.lat}
              onChange={(e) => set("lat", e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Longitude
            <input
              className={inputClass}
              type="number"
              inputMode="decimal"
              step="any"
              min={-180}
              max={180}
              required
              value={form.lng}
              onChange={(e) => set("lng", e.target.value)}
            />
          </label>
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Type
          <select
            className={inputClass}
            value={form.space_type}
            onChange={(e) => set("space_type", e.target.value as Space["space_type"])}
          >
            {SPACE_TYPES.map((type) => (
              <option key={type} value={type}>
                {capitalize(type)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Ownership
          <select
            className={inputClass}
            value={form.ownership}
            onChange={(e) => set("ownership", e.target.value as Space["ownership"])}
          >
            {OWNERSHIPS.map((ownership) => (
              <option key={ownership} value={ownership}>
                {capitalize(ownership)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Number of slots
          <input
            className={inputClass}
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            required
            value={form.total_slots}
            onChange={(e) => set("total_slots", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Price per hour (₹)
          <input
            className={inputClass}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            required
            value={form.price_per_hour}
            onChange={(e) => set("price_per_hour", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Opens at
          <input
            className={inputClass}
            type="time"
            required
            value={form.open_time}
            onChange={(e) => set("open_time", e.target.value)}
          />
        </label>
        <label className={labelClass}>
          Closes at
          <input
            className={inputClass}
            type="time"
            required
            value={form.close_time}
            onChange={(e) => set("close_time", e.target.value)}
          />
        </label>
      </div>

      <label className="flex items-center gap-3 py-1 text-base">
        <input
          type="checkbox"
          className="h-5 w-5 accent-emerald-600"
          checked={form.is_active}
          onChange={(e) => set("is_active", e.target.checked)}
        />
        Listed — drivers can find this space
      </label>

      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Saving…" : space ? "Save changes" : "Add space"}
        </button>
        <Link href="/owner/spaces" className={secondaryButtonClass}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
