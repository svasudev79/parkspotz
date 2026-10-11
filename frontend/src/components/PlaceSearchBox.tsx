"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import type { Place } from "@/lib/landmarks";
import { LandmarkPicker } from "./LandmarkPicker";

// Google Places Autocomplete (the PlaceAutocompleteElement widget), limited to
// India. Falls back to the landmark picker if Google Maps cannot be loaded.
export function PlaceSearchBox({ id, onPick }: { id?: string; onPick: (place: Place) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onPickRef.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let cancelled = false;
    let element: google.maps.places.PlaceAutocompleteElement | null = null;

    loadGoogleMaps()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        element = new google.maps.places.PlaceAutocompleteElement({ includedRegionCodes: ["in"] });
        element.style.width = "100%";
        element.style.colorScheme = "light"; // the app has a light theme only
        element.setAttribute("placeholder", "Search for a place");
        element.addEventListener("gmp-select", async (event) => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
          if (!place.location) return;
          onPickRef.current({
            name: place.displayName ?? place.formattedAddress ?? "Selected place",
            address: place.formattedAddress ?? undefined,
            lat: place.location.lat(),
            lng: place.location.lng(),
          });
        });
        hostRef.current.appendChild(element);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      element?.remove();
    };
  }, []);

  if (failed) return <LandmarkPicker id={id} onPick={onPick} />;
  return (
    <div
      id={id}
      ref={hostRef}
      className="min-h-12 rounded-lg border border-slate-300 bg-white focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-100"
    />
  );
}
