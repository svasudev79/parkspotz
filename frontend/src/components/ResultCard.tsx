"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { formatDistance } from "@/lib/format";
import type { SearchResult } from "@/lib/types";
import { SpaceFacts } from "./SpaceFacts";

function availability(space: SearchResult): { text: string; className: string } {
  if (!space.is_open) return { text: "Closed at this time", className: "bg-slate-200 text-slate-700" };
  if (space.slots_available === 0) return { text: "Full", className: "bg-red-100 text-red-800" };
  const noun = space.slots_available === 1 ? "slot" : "slots";
  return { text: `${space.slots_available} ${noun} available`, className: "bg-emerald-100 text-emerald-800" };
}

// One search result. Clicking the card selects it (and its map pin); the
// "View details" link opens the space page.
export function ResultCard({
  space,
  selected,
  detailsHref,
  onSelect,
}: {
  space: SearchResult;
  selected: boolean;
  detailsHref: string;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const badge = availability(space);

  // Selecting a pin on the map scrolls the matching card into view.
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected]);

  return (
    <li
      ref={ref}
      onClick={onSelect}
      aria-current={selected}
      className={`flex cursor-pointer flex-col gap-2 rounded-xl border bg-white p-4 ${
        selected ? "border-emerald-600 ring-2 ring-emerald-200" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-lg font-semibold break-words">{space.name}</h3>
        <span className="shrink-0 text-sm font-medium text-slate-700">{formatDistance(space.distance_m)}</span>
      </div>
      <p className="text-sm text-slate-600 break-words">{space.address}</p>
      <SpaceFacts space={space} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-3 py-1 text-sm font-medium ${badge.className}`}>
          {badge.text}
          {space.is_open && <span className="font-normal"> of {space.total_slots}</span>}
        </span>
        <Link
          href={detailsHref}
          className="inline-flex h-11 items-center rounded-lg px-3 text-base font-semibold text-emerald-700 underline hover:bg-emerald-50"
        >
          View details
        </Link>
      </div>
    </li>
  );
}
