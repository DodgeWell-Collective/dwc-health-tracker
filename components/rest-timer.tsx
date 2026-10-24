"use client";

import { useEffect, useState } from "react";

/** Counts down rest after the last logged set; buzzes once when it's time for the next one. */
export function RestTimer({ since, seconds }: { since: number; seconds: number }) {
  // null until mounted: the clock differs between server and browser, so render nothing on the server.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const left = now == null ? null : Math.round(seconds - (now - since) / 1000);
  useEffect(() => {
    if (left === 0) navigator.vibrate?.([120, 80, 120]);
  }, [left]);

  if (left == null || left < -90) return null; // long past: don't nag
  if (left <= 0) return <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white">Go</span>;
  return (
    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" aria-live="off" title="Rest timer">
      Rest {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </span>
  );
}
