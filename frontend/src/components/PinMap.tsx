"use client";

import { useEffect, useRef } from "react";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { BANGALORE_CENTER } from "@/lib/landmarks";

type Position = { lat: number; lng: number };

// Small Google map with one draggable pin, for placing a parking space.
// Only rendered when a Maps key is set.
export function PinMap({ position, onMove }: { position: Position | null; onMove: (position: Position) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const onMoveRef = useRef(onMove);
  const positionRef = useRef(position);

  useEffect(() => {
    onMoveRef.current = onMove;
    positionRef.current = position;
  });

  // Create the map and its pin once.
  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !hostRef.current) return;
        const start = positionRef.current ?? BANGALORE_CENTER;
        const map = new google.maps.Map(hostRef.current, {
          center: start,
          zoom: positionRef.current ? 16 : 12,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        const marker = new google.maps.Marker({ map, position: start, draggable: true, title: "Drag to the entrance" });
        const report = (event: google.maps.MapMouseEvent) => {
          if (!event.latLng) return;
          marker.setPosition(event.latLng);
          onMoveRef.current({ lat: event.latLng.lat(), lng: event.latLng.lng() });
        };
        marker.addListener("dragend", report);
        map.addListener("click", report);
        mapRef.current = map;
        markerRef.current = marker;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      markerRef.current?.setMap(null);
      markerRef.current = null;
      mapRef.current = null;
    };
  }, []);

  // Follow position changes made outside the map (place search, typed lat/lng).
  const lat = position?.lat;
  const lng = position?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined || !mapRef.current || !markerRef.current) return;
    markerRef.current.setPosition({ lat, lng });
    mapRef.current.panTo({ lat, lng });
  }, [lat, lng]);

  return <div ref={hostRef} className="h-64 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100" />;
}
