import type { Metadata } from "next";
import Link from "next/link";
import { RentalStatusBadge } from "@/components/RentalStatusBadge";
import { cardClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { AdminSpace } from "@/lib/types";

export const metadata: Metadata = { title: "All spaces · ParkSpotZ" };

const COLUMNS: { key: string; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Space" },
  { key: "slots", label: "Slots", numeric: true },
  { key: "bookings", label: "Bookings this month", numeric: true },
  { key: "utilisation", label: "Utilisation this month", numeric: true },
  { key: "rental", label: "Rental this month" },
  { key: "created", label: "Added" },
];

// Every parking space on the platform. Sorting is done by the API and kept
// in the page address (?sort=...&dir=...).
export default async function AdminSpacesPage(props: PageProps<"/admin/spaces">) {
  await requireRole("admin");
  const query = await props.searchParams;
  const sort = typeof query.sort === "string" ? query.sort : "name";
  const dir = query.dir === "desc" ? "desc" : "asc";
  const data = await apiGet<{ spaces: AdminSpace[] }>(`/admin/spaces?sort=${encodeURIComponent(sort)}&dir=${dir}`);
  const spaces = data?.spaces ?? [];

  // Clicking the current sort column flips its direction.
  const sortHref = (key: string) =>
    `/admin/spaces?sort=${key}&dir=${sort === key && dir === "asc" ? "desc" : "asc"}`;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
      <div>
        <h1 className="text-2xl font-bold">All spaces ({spaces.length})</h1>
        <p className="mt-1 text-sm text-slate-600">Tap a column heading to sort. On a phone, scroll the table sideways.</p>
      </div>
      {!data && <p className="text-red-700">Could not load the spaces. Please refresh the page.</p>}

      <div className={`${cardClass} overflow-x-auto p-0`}>
        <table className="w-full min-w-[56rem] text-left text-sm">
          <thead className="border-b border-slate-200 text-slate-600">
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key} className={`px-3 py-1 font-medium ${column.numeric ? "text-right" : ""}`}>
                  <Link href={sortHref(column.key)} className="inline-flex min-h-11 items-center gap-1 underline">
                    {column.label}
                    {sort === column.key && <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {spaces.map((space) => (
              <tr key={space.id} className="border-b border-slate-100 align-top">
                <td className="max-w-xs px-3 py-3">
                  <p className="font-semibold break-words">
                    {space.name}
                    {!space.is_active && <span className="ml-2 font-normal text-slate-500">(not listed)</span>}
                  </p>
                  <p className="text-slate-600">Owner: {space.owner}</p>
                  <p className="break-words text-slate-600">{space.address}</p>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {space.total_slots}
                  <p className="text-slate-600">{space.tier ?? "—"}</p>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{space.bookings_month}</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {space.utilisation_month.percent}%
                  <p className="text-slate-600">
                    {space.utilisation_month.booked_hours} of {space.utilisation_month.available_hours} h
                  </p>
                </td>
                <td className="px-3 py-3">
                  <RentalStatusBadge status={space.rental_status} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">{formatDate(space.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
