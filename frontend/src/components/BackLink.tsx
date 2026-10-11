"use client";

import { useRouter } from "next/navigation";

// Goes back one page (so a search keeps its results), or to `fallback` when
// this page was opened directly.
export function BackLink({ fallback, children }: { fallback: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push(fallback))}
      className="inline-block self-start py-3 text-sm font-medium text-emerald-700 underline print:hidden"
    >
      {children}
    </button>
  );
}
