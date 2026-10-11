"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { homeFor, type Role, type User } from "@/lib/types";
import { inputClass } from "./ui";

const ROLES: { value: Role; title: string; hint: string }[] = [
  { value: "customer", title: "Customer", hint: "Find and book parking" },
  { value: "owner", title: "Space owner", hint: "List and manage a parking space" },
];

// `next` is a path on this site to open after logging in (e.g. a QR verify link).
export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string | null }) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("customer");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const body = isSignup ? { username, password, role } : { username, password };
      const { user } = await api<{ user: User }>(`/auth/${mode}`, { method: "POST", body });
      router.replace(next ?? homeFor(user.role));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold">{isSignup ? "Create your account" : "Log in"}</h1>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Username
          <input
            className={inputClass}
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            required
            minLength={3}
            maxLength={30}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Password
          <input
            className={inputClass}
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && <span className="font-normal text-slate-500">At least 8 characters</span>}
        </label>

        {isSignup && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">I am a</legend>
            {ROLES.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${
                  role === option.value ? "border-emerald-600 bg-emerald-50" : "border-slate-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  className="h-5 w-5 accent-emerald-600"
                  value={option.value}
                  checked={role === option.value}
                  onChange={() => setRole(option.value)}
                />
                <span className="flex flex-col">
                  <span className="font-medium">{option.title}</span>
                  <span className="text-sm text-slate-500">{option.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="h-12 rounded-lg bg-emerald-600 text-base font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {busy ? "Please wait…" : isSignup ? "Sign up" : "Log in"}
        </button>
      </form>

      <p className="mt-6 text-sm text-slate-600">
        {isSignup ? "Already have an account? " : "New to ParkSpotZ? "}
        <Link
          href={`${isSignup ? "/login" : "/signup"}${next ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="inline-block py-3 font-medium text-emerald-700 underline"
        >
          {isSignup ? "Log in" : "Sign up"}
        </Link>
      </p>
    </div>
  );
}
