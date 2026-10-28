"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const NAV = [
  { href: "/", label: "Today", icon: "M12 8v4l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/train", label: "Train", icon: "M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12" },
  { href: "/plan", label: "Meals", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/shopping", label: "Shopping", icon: "M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6M10 20h.01M17 20h.01" },
  { href: "/progress", label: "Progress", icon: "M4 19V5M4 19h16M8 15l4-4 3 3 5-6" },
  { href: "/settings", label: "Settings", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" },
];

/** Set when Log is tapped in the app, so closing the panel goes back rather than to Today. */
export const LOG_BACK_KEY = "logBack";

const SCAN_ICON = "M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M8 8v8M11 8v8M14 8v8M17 8v8";

function Icon({ d, className = "h-5 w-5" }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={`${className} shrink-0`} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

/** Highlights the tapped tab right away, before the new page arrives. */
function useActive() {
  const path = usePathname();
  const [tapped, setTapped] = useState<string | null>(null);
  useEffect(() => setTapped(null), [path]);
  const current = tapped ?? path;
  const active = (href: string) => (href === "/" ? current === "/" || current.startsWith("/day/") : current.startsWith(href));
  return { active, tap: (href: string) => () => setTapped(href) };
}

/** Opens the log panel over Today; closing it goes back to the page Log was tapped on. */
function LogLink({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <Link href="/?log" scroll={false} onClick={() => { try { sessionStorage.setItem(LOG_BACK_KEY, "1"); } catch {} }} className={className}>
      {children}
    </Link>
  );
}

/** Desktop: fixed left rail. */
export function SideNav() {
  const { active, tap } = useActive();
  return (
    <nav className="fixed inset-y-0 left-0 z-10 hidden w-48 flex-col gap-1 border-r border-zinc-200 bg-white px-3 py-5 md:flex dark:border-zinc-800 dark:bg-zinc-950">
      <span className="mb-4 px-3 font-semibold text-emerald-600">Health</span>
      <LogLink className="mb-2 flex items-center gap-3 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        <Icon d={SCAN_ICON} />
        Log food
      </LogLink>
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={tap(n.href)}
          aria-current={active(n.href) ? "page" : undefined}
          className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${active(n.href) ? "bg-emerald-50 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"}`}
        >
          <Icon d={n.icon} />
          {n.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phones and tablets: bottom tab bar, with Log raised in the middle. */
export function TabBar() {
  const { active, tap } = useActive();
  const tab = (n: (typeof NAV)[number]) => (
    <Link
      key={n.href}
      href={n.href}
      onClick={tap(n.href)}
      aria-current={active(n.href) ? "page" : undefined}
      className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${active(n.href) ? "text-emerald-600" : "text-zinc-600 dark:text-zinc-400"}`}
    >
      <Icon d={n.icon} />
      {n.label}
    </Link>
  );
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="grid grid-cols-7">
        {NAV.slice(0, 3).map(tab)}
        <LogLink className="-mt-5 flex flex-col items-center gap-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-white shadow-md dark:border-zinc-950">
            <Icon d={SCAN_ICON} className="h-7 w-7" />
          </span>
          Log
        </LogLink>
        {NAV.slice(3).map(tab)}
      </div>
    </nav>
  );
}
