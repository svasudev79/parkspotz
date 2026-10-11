"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatHours, formatRupees, formatWindow } from "@/lib/format";
import type { Booking, Space } from "@/lib/types";
import { cardClass, errorClass, inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "./ui";

// "Book this space" on the space page: shows the time window carried over from
// search, asks for confirmation, creates the booking and moves on to payment.
// The amount shown is an estimate; the API works out the real one.
// A guest (`guest`, not logged in) also gives a name and mobile number.
export function BookingPanel({
  space,
  start,
  end,
  guest,
}: {
  space: Space;
  start: string | null;
  end: string | null;
  guest: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  if (!start || !end) {
    return (
      <section className={`${cardClass} flex flex-col gap-3`}>
        <h2 className="text-lg font-semibold">Book this space</h2>
        <p className="text-slate-700">Choose a date and time on the search screen first.</p>
        <Link href={guest ? "/" : "/search"} className={primaryButtonClass}>
          Search with a date and time
        </Link>
      </section>
    );
  }

  const hours = (new Date(end).getTime() - new Date(start).getTime()) / 3_600_000;
  const amount = Math.round(hours * space.price_per_hour * 100) / 100;

  async function book() {
    setError("");
    setBusy(true);
    try {
      if (guest) {
        const { booking } = await api<{ booking: Booking }>("/guest/bookings", {
          method: "POST",
          body: { space_id: space.id, start, end, name, phone },
        });
        router.push(`/receipt/${booking.access_token}/pay`);
      } else {
        const { booking } = await api<{ booking: Booking }>("/bookings", {
          method: "POST",
          body: { space_id: space.id, start, end },
        });
        router.push(`/bookings/${booking.id}/pay`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not book this space");
      setBusy(false);
    }
  }

  return (
    <section className={`${cardClass} flex flex-col gap-3`}>
      <h2 className="text-lg font-semibold">{confirming ? "Confirm your booking" : "Book this space"}</h2>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
        {confirming && (
          <>
            <dt className="text-slate-500">Space</dt>
            <dd className="font-medium break-words">{space.name}</dd>
          </>
        )}
        <dt className="text-slate-500">When</dt>
        <dd className="font-medium">{formatWindow(start, end)}</dd>
        <dt className="text-slate-500">Duration</dt>
        <dd className="font-medium">{formatHours(hours)}</dd>
        <dt className="text-slate-500">Amount</dt>
        <dd className="font-semibold">{formatRupees(amount)}</dd>
      </dl>

      {confirming && guest && (
        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3">
          <label className={labelClass}>
            Your name
            <input
              className={inputClass}
              autoComplete="name"
              required
              minLength={2}
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Mobile number
            <input
              className={inputClass}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
              required
              maxLength={16}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <span className="font-normal text-slate-500">
              Used only so the parking space can identify your booking.
            </span>
          </label>
          <p className="text-sm text-slate-600">
            You are booking as a guest.{" "}
            <Link href="/signup" className="font-medium text-emerald-700 underline">
              Sign up
            </Link>{" "}
            or{" "}
            <Link href="/login" className="font-medium text-emerald-700 underline">
              log in
            </Link>{" "}
            to keep all your bookings in one place.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className={errorClass}>
          {error}
        </p>
      )}

      {confirming ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy || (guest && (name.trim().length < 2 || phone.trim().length < 10))}
            onClick={book}
            className={primaryButtonClass}
          >
            {busy ? "Booking…" : `Confirm and pay ${formatRupees(amount)}`}
          </button>
          <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={secondaryButtonClass}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={primaryButtonClass}>
          Book
        </button>
      )}
      {confirming && (
        <p className="text-sm text-slate-500">Your slot is held for a few minutes while you pay.</p>
      )}
    </section>
  );
}
