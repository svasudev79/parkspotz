"use client";

import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, PIN_ICONS } from "@/lib/googleMaps";
import { BANGALORE_CENTER, type Place } from "@/lib/landmarks";
import type { SearchResult } from "@/lib/types";

// Google map for the search screen: a blue pin for the destination, a circle
// for the search radius and one pin per parking space (green when selected).
// Only rendered when a Maps key is set.
export function ResultsMap({
  destination,
  radius,
  results,
  selectedId,
  onSelect,
}: {
  destination: Place | null;
  radius: number;
  results: SearchResult[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<number, google.maps.Marker>());
  const onSelectRef = useRef(onSelect);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        mapRef.current = new google.maps.Map(hostRef.current, {
          center: BANGALORE_CENTER,
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, []);

  // Redraw the destination, radius and space pins whenever the search changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !destination) return;

    const center = { lat: destination.lat, lng: destination.lng };
    const destinationPin = new google.maps.Marker({
      map,
      position: center,
      title: destination.name,
      icon: PIN_ICONS.destination,
    });
    const circle = new google.maps.Circle({
      map,
      center,
      radius,
      strokeColor: "#059669",
      strokeOpacity: 0.6,
      strokeWeight: 1,
      fillColor: "#059669",
      fillOpacity: 0.06,
      clickable: false,
    });
    const bounds = circle.getBounds();
    if (bounds) map.fitBounds(bounds);

    const markers = markersRef.current;
    for (const space of results) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: space.lat, lng: space.lng },
        title: `${space.name} — ${space.slots_available} of ${space.total_slots} slots available`,
        icon: PIN_ICONS.space,
      });
      marker.addListener("click", () => onSelectRef.current(space.id));
      markers.set(space.id, marker);
    }

    return () => {
      destinationPin.setMap(null);
      circle.setMap(null);
      markers.forEach((marker) => marker.setMap(null));
      markers.clear();
    };
  }, [ready, destination, radius, results]);

  // Highlight the selected space's pin and bring it into view.
  useEffect(() => {
    if (!ready) return;
    markersRef.current.forEach((marker, id) => {
      const selected = id === selectedId;
      marker.setIcon(selected ? PIN_ICONS.selected : PIN_ICONS.space);
      marker.setZIndex(selected ? 1000 : null);
      const position = marker.getPosition();
      if (selected && position) mapRef.current?.panTo(position);
    });
  }, [ready, selectedId, results]);

  if (failed) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-sm text-slate-500">
        The map could not be loaded. Check the Google Maps API key. Results are listed below.
      </p>
    );
  }
  return (
    <div
      ref={hostRef}
      aria-label="Map of parking spaces"
      className="h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 lg:h-[32rem]"
    />
  );
}
