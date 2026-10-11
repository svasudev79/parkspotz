"use client";

import { useState } from "react";
import { LANDMARKS, type Place } from "@/lib/landmarks";
import { inputClass } from "./ui";

// Type-ahead over the built-in Bangalore landmarks. Used when there is no
// Google Maps key (or Google Maps fails to load).
export function LandmarkPicker({
  id,
  placeholder,
  onPick,
}: {
  id?: string;
  placeholder?: string;
  onPick: (place: Place) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const needle = query.trim().toLowerCase();
  const matches = LANDMARKS.filter((place) => place.name.toLowerCase().includes(needle));

  function pick(place: Place) {
    setQuery(place.name);
    setOpen(false);
    onPick(place);
  }

  return (
    <div className="relative">
      <input
        id={id}
        className={inputClass}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id ?? "landmark"}-options`}
        autoComplete="off"
        placeholder={placeholder ?? "Type a Bangalore landmark"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && matches[0]) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
      />
      {open && (
        <ul
          id={`${id ?? "landmark"}-options`}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.map((place) => (
            <li key={place.name} role="option" aria-selected={place.name === query}>
              <button
                type="button"
                className="block w-full px-3 py-3 text-left text-base hover:bg-emerald-50"
                // onMouseDown so the pick lands before the input's blur closes the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(place);
                }}
              >
                {place.name}
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-3 text-sm text-slate-500">No matching landmark. Try “MG Road” or “Hebbal”.</li>
          )}
        </ul>
      )}
    </div>
  );
}
