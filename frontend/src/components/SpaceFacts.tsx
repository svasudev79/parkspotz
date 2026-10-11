import { capitalize, formatRupees } from "@/lib/format";
import type { Space } from "@/lib/types";

// The facts shown for a space wherever it is listed: price, hours, type.
export function SpaceFacts({ space }: { space: Space }) {
  return (
    <p className="text-sm text-slate-600">
      <span className="font-semibold text-slate-900">{formatRupees(space.price_per_hour)}/hour</span>
      {" · "}
      {space.open_time}–{space.close_time}
      {" · "}
      {capitalize(space.space_type)}
      {" · "}
      {capitalize(space.ownership)}
    </p>
  );
}
