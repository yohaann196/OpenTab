"use client";

import { cn } from "@/lib/utils";

/** A group of toggle buttons for filters (not tabs: there are no tab panels). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of toggle buttons
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1 text-fg-muted",
        className,
      )}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition",
            value === o.value ? "bg-surface text-fg shadow-soft" : "hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
