"use client";

import { HAS_MAPS_KEY } from "@/lib/googleMaps";
import type { Place } from "@/lib/landmarks";
import { LandmarkPicker } from "./LandmarkPicker";
import { PlaceSearchBox } from "./PlaceSearchBox";

// Place search: Google Places when a Maps key is set, built-in landmarks otherwise.
export function DestinationInput({
  id,
  placeholder,
  onPick,
}: {
  id?: string;
  placeholder?: string;
  onPick: (place: Place) => void;
}) {
  return HAS_MAPS_KEY ? (
    <PlaceSearchBox id={id} onPick={onPick} />
  ) : (
    <LandmarkPicker id={id} placeholder={placeholder} onPick={onPick} />
  );
}
