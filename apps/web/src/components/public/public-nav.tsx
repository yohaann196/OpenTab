"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function PublicNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/t/${slug}`;
  const items = [
    { href: base, label: "Home", exact: true },
    { href: `${base}/pairings`, label: "Pairings" },
    { href: `${base}/results`, label: "Results" },
    { href: `${base}/judges`, label: "Judges" },
  ];
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Tournament">
      {items.map((i) => {
        const active = i.exact ? pathname === i.href : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition",
              active
                ? "border-brand font-medium text-fg"
                : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
