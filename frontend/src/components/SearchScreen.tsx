"use client";

import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime, formatDistance, formatTime, tomorrowInIst } from "@/lib/format";
import { HAS_MAPS_KEY } from "@/lib/googleMaps";
import type { Place } from "@/lib/landmarks";
import { searchWindow, type Search, type SearchForm } from "@/lib/search";
import { DestinationInput } from "./DestinationInput";
import { ResultCard } from "./ResultCard";
import { ResultsMap } from "./ResultsMap";
import { errorClass, inputClass, labelClass, primaryButtonClass } from "./ui";

const RADII = [500, 1000, 2000];
const DURATIONS = [1, 2, 3, 4, 6, 8, 12];

// The search itself runs on the server: submitting the form puts the search in
// the page URL, and search/page.tsx reads it back and passes in the results.
// So Back from a space page, or a reload, shows the same search again.
export function SearchScreen({
  initialForm,
  search,
  searchFailed,
}: {
  initialForm: SearchForm | null;
  search: Search | null;
  searchFailed: boolean;
}) {
  const router = useRouter();
  const [destination, setDestination] = useState<Place | null>(initialForm?.destination ?? null);
  const [radius, setRadius] = useState(initialForm?.radius ?? 1000);
  const [date, setDate] = useState(() => initialForm?.date ?? tomorrowInIst());
  const [time, setTime] = useState(initialForm?.time ?? "10:00");
  const [hours, setHours] = useState(initialForm?.hours ?? 2);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, startSearch] = useTransition();
  const resultsRef = useRef<HTMLElement>(null);

  // On a phone the results start below the form, so bring them into view.
  useEffect(() => {
    if (search) resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [search]);

  function runSearch(place: Place | null, radiusM: number) {
    setError("");
    if (!place) {
      setError("Choose a destination first.");
      return;
    }
    if (Number.isNaN(searchWindow({ date, time, hours }).start.getTime())) {
      setError("Choose a date and a start time.");
      return;
    }
    const query = new URLSearchParams({
      name: place.name,
      lat: String(place.lat),
      lng: String(place.lng),
      radius: String(radiusM),
      date,
      time,
      hours: String(hours),
    });
    setSelectedId(null);
    startSearch(() => router.replace(`/search?${query}`, { scroll: false }));
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    runSearch(destination, radius);
  }

  // Changing the radius after a search re-runs it straight away.
  function chooseRadius(value: number) {
    setRadius(value);
    if (search && destination) runSearch(destination, value);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={submit} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className={labelClass}>
          <label htmlFor="destination">Destination</label>
          <DestinationInput
            id="destination"
            placeholder="Where are you going?"
            defaultValue={initialForm?.destination.name}
            onPick={setDestination}
          />
          {HAS_MAPS_KEY ? (
            destination && <span className="font-normal text-slate-500">Searching near {destination.name}</span>
          ) : (
            <span className="font-normal text-slate-500">Pick from well-known Bangalore places.</span>
          )}
        </div>

        <fieldset className="flex min-w-0 flex-col gap-1">
          <legend className="mb-1 text-sm font-medium">Search within</legend>
          <div className="grid grid-cols-3 gap-2">
            {RADII.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={radius === value}
                onClick={() => chooseRadius(value)}
                className={`h-12 rounded-lg border text-base font-medium ${
                  radius === value
                    ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {formatDistance(value).replace(".0", "")}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className={labelClass}>
            Date
            <input
              className={inputClass}
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Start time (IST)
            <input
              className={inputClass}
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Duration
            <select className={inputClass} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {DURATIONS.map((value) => (
                <option key={value} value={value}>
                  {value} {value === 1 ? "hour" : "hours"}
                </option>
              ))}
            </select>
          </label>
        </div>

        {(error || searchFailed) && (
          <p role="alert" className={errorClass}>
            {error || "The search failed. Please try again."}
          </p>
        )}

        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? "Searching…" : "Search parking"}
        </button>
      </form>

      {search && (
        <section ref={resultsRef} aria-label="Search results" className="flex scroll-mt-4 flex-col gap-3">
          <div>
            <h2 className="text-lg font-semibold">
              {search.results.length} {search.results.length === 1 ? "space" : "spaces"} within{" "}
              {formatDistance(search.radius).replace(".0", "")} of {search.destination.name}
            </h2>
            <p className="text-sm text-slate-600">
              {formatDateTime(search.start)} to {formatTime(search.end)} IST
            </p>
          </div>

          {/* Map above the list on phones; side by side on wide screens. */}
          <div className={HAS_MAPS_KEY ? "flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start" : "flex flex-col gap-4"}>
            <div className={HAS_MAPS_KEY ? "lg:sticky lg:top-4 lg:order-2" : ""}>
              {HAS_MAPS_KEY ? (
                <ResultsMap
                  destination={search.destination}
                  radius={search.radius}
                  results={search.results}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
                  Add a Google Maps API key to see the map
                </p>
              )}
            </div>

            {search.results.length === 0 ? (
              <p className="text-slate-600">
                No parking spaces found here. Try a wider radius or another destination.
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {search.results.map((space) => (
                  <ResultCard
                    key={space.id}
                    space={space}
                    selected={space.id === selectedId}
                    detailsHref={`/spaces/${space.id}?start=${encodeURIComponent(search.start)}&end=${encodeURIComponent(search.end)}`}
                    onSelect={() => setSelectedId(space.id)}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
