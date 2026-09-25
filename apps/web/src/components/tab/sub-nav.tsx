"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SubNav({ items }: { items: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-border" aria-label="Section">
      {items.map((i) => {
        const active = i.exact
          ? pathname === i.href
          : pathname === i.href || pathname.startsWith(`${i.href}/`);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition",
              active
                ? "border-brand font-medium text-fg"
                : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
