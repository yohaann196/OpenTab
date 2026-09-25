"use client";

import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative ${className ?? ""}`}>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-fg-subtle"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-8"
        aria-label={placeholder}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
          aria-label="Clear search"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

export function matches(q: string, ...fields: (string | null | undefined)[]) {
  if (!q) return true;
  const needle = q.toLowerCase();
  return fields.some((f) => f?.toLowerCase().includes(needle));
}
