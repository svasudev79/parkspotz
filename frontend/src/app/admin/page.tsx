import type { Metadata } from "next";
import Link from "next/link";
import { cardClass } from "@/components/ui";
import { formatMonth, formatRupees } from "@/lib/format";
import { apiGet, requireRole } from "@/lib/session";
import type { AdminDashboard } from "@/lib/types";

export const metadata: Metadata = { title: "Admin dashboard · ParkSpotZ" };

const PERIODS = [
  ["day", "Today"],
  ["week", "This week"],
  ["month", "This month"],
] as const;

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className={`${cardClass} flex flex-col gap-1`}>
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
      {note && <dd className="text-sm text-slate-600">{note}</dd>}
    </div>
  );
}

const hours = (value: number) => value.toLocaleString("en-IN", { maximumFractionDigits: 1 });

// Platform-wide numbers for the person who runs ParkSpotZ.
export default async function AdminDashboardPage() {
  await requireRole("admin");
  const data = await apiGet<AdminDashboard>("/admin/dashboard");
  if (!data) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-4 text-red-700">Could not load the dashboard. Please refresh the page.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Onboarding</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Parking spaces" value={data.spaces.total} note={`${data.spaces.added_this_month} added this month`} />
          <Stat label="Listed (active)" value={data.spaces.active} />
          <Stat label="Not listed" value={data.spaces.inactive} />
          <Stat label="Space owners" value={data.users.owners} />
          <Stat label="Attendants" value={data.users.attendants} />
          <Stat label="Customers" value={data.users.customers} />
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Slots managed</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total slots" value={data.slots.total} />
          {data.slots.by_tier.map((tier) => (
            <Stat
              key={tier.name}
              label={`${tier.name} (${tier.min_slots}${tier.max_slots === null ? "+" : `–${tier.max_slots}`} slots)`}
              value={tier.slots}
              note={`${tier.spaces} ${tier.spaces === 1 ? "space" : "spaces"} · ${formatRupees(tier.monthly_fee)}/month each`}
            />
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">In use right now</h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Vehicles inside" value={data.in_use.vehicles_inside} note="entered, not yet left" />
          <Stat label="Slots booked now" value={data.in_use.slots_booked_now} note="paid bookings covering this moment" />
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Utilisation</h2>
        <p className="text-sm text-slate-600">
          Booked slot-hours as a share of available slot-hours (slots × daily opening hours × days) across listed
          spaces. IST; weeks run Monday to Sunday.
        </p>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PERIODS.map(([key, label]) => (
            <Stat
              key={key}
              label={label}
              value={`${data.utilisation[key].percent}%`}
              note={`${hours(data.utilisation[key].booked_hours)} of ${hours(data.utilisation[key].available_hours)} slot-hours`}
            />
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Bookings</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PERIODS.map(([key, label]) => (
            <Stat
              key={key}
              label={label}
              value={data.bookings[key].count}
              note={`${formatRupees(data.bookings[key].revenue)} paid · ${data.bookings[key].registered} by customers, ${data.bookings[key].guest} by guests`}
            />
          ))}
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-xl font-bold">Rental · {formatMonth(data.rental.month)}</h2>
          <Link href="/admin/rental" className="py-3 text-sm font-medium text-emerald-700 underline">
            Invoices and tiers
          </Link>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Invoiced" value={formatRupees(data.rental.invoiced)} />
          <Stat label="Collected" value={formatRupees(data.rental.collected)} />
          <Stat label="Outstanding" value={formatRupees(data.rental.outstanding)} />
          <Stat label="Overdue invoices" value={data.rental.overdue_count} note="all months" />
        </dl>
      </section>
    </main>
  );
}
