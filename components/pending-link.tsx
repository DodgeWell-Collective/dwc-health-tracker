"use client";

import Link, { useLinkStatus } from "next/link";

function Label({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "animate-pulse opacity-40" : undefined}>{children}</span>;
}

/**
 * A Link that fades its label while the next page loads, so a tap always shows a response.
 * Prefetches the full page: the default ("auto") prefetch of a same-path, different-query
 * link (the day arrows) isn't reused on tap, so it refetched every time.
 */
export function PendingLink({ children, ...props }: React.ComponentProps<typeof Link>) {
  return (
    <Link prefetch {...props}>
      <Label>{children}</Label>
    </Link>
  );
}
