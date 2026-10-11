"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { Attendant } from "@/lib/types";
import { cardClass, errorClass, inputClass, labelClass, primaryButtonClass } from "./ui";

// Owner's list of gate attendants for one space, with add and remove.
// An attendant logs in with the username and password set here and can only
// work this space's gate; they never see prices or revenue.
export function AttendantsManager({ spaceId, attendants }: { spaceId: number; attendants: Attendant[] }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function add(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { attendant } = await api<{ attendant: Attendant }>(`/owner/spaces/${spaceId}/attendants`, {
        method: "POST",
        body: { username, password },
      });
      setNotice(`${attendant.username} can now log in with the password you set.`);
      setUsername("");
      setPassword("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the attendant");
    }
    setBusy(false);
  }

  async function remove(attendant: Attendant) {
    if (!window.confirm(`Remove ${attendant.username}? They will no longer be able to log in.`)) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      await api(`/owner/spaces/${spaceId}/attendants/${attendant.id}`, { method: "DELETE" });
      setNotice(`${attendant.username} was removed.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the attendant");
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {attendants.length === 0 ? (
        <p className="text-slate-600">No attendants yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {attendants.map((attendant) => (
            <li key={attendant.id} className={`${cardClass} flex items-center justify-between gap-3`}>
              <span className="min-w-0 font-medium break-words">{attendant.username}</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(attendant)}
                className="inline-flex h-11 shrink-0 items-center rounded-lg border border-red-300 px-4 text-base font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className={`${cardClass} flex flex-col gap-4`}>
        <h3 className="text-base font-semibold">Add an attendant</h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            Username
            <input
              className={inputClass}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              required
              minLength={3}
              maxLength={30}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className={labelClass}>
            Password
            <input
              className={inputClass}
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <span className="font-normal text-slate-500">At least 8 characters. Give it to the attendant.</span>
          </label>
        </div>
        {error && (
          <p role="alert" className={errorClass}>
            {error}
          </p>
        )}
        {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{notice}</p>}
        <button type="submit" disabled={busy} className={`${primaryButtonClass} sm:self-start`}>
          {busy ? "Saving…" : "Add attendant"}
        </button>
      </form>
    </div>
  );
}
