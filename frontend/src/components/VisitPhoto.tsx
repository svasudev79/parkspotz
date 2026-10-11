import type { Visit } from "@/lib/types";

// Thumbnail of a visit's entry photo; tapping it opens the full photo.
// The photo is served by the API only to the space's own staff.
export function VisitPhoto({ visit, size = "h-16 w-16" }: { visit: Visit; size?: string }) {
  if (!visit.has_photo) return null;
  const src = `/api/visits/${visit.id}/photo`;
  return (
    <a href={src} target="_blank" rel="noopener" className="shrink-0" aria-label="Open the entry photo">
      {/* eslint-disable-next-line @next/next/no-img-element -- private, API-served photo */}
      <img src={src} alt="Vehicle at entry" className={`${size} rounded-lg border border-slate-200 object-cover`} />
    </a>
  );
}
