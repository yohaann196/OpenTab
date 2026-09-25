import Link from "next/link";
import { cn } from "@/lib/utils";

/** OpenTab mark: two facing speech brackets forming a lectern. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-brand" />
      <path
        d="M11 9.5 7.5 16l3.5 6.5"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 9.5 24.5 16 21 22.5"
        fill="none"
        stroke="white"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".75"
      />
      <rect x="14.6" y="11" width="2.8" height="10" rx="1.4" fill="white" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link
      href={href}
      className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}
      aria-label="OpenTab home"
    >
      <LogoMark />
      <span className="text-[17px]">OpenTab</span>
    </Link>
  );
}
