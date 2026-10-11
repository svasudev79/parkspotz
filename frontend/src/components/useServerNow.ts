"use client";

import { useEffect, useState } from "react";

// The current time, starting from the server's clock (`serverNow`, ISO) and
// advancing with time elapsed in the browser. Re-renders every 30 seconds.
// The device's own clock is never used, so a wrong phone clock cannot skew
// the time-left display.
export function useServerNow(serverNow: string): number {
  const base = new Date(serverNow).getTime();
  const [elapsed, setElapsed] = useState({ base, ms: 0 });

  useEffect(() => {
    const startedAt = performance.now();
    const tick = () => setElapsed({ base, ms: performance.now() - startedAt });
    const timer = window.setInterval(tick, 30_000);
    return () => window.clearInterval(timer);
  }, [base]);

  // A fresh server time (after a reload of the page data) restarts the count.
  return elapsed.base === base ? base + elapsed.ms : base;
}
