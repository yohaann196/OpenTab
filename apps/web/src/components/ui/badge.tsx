import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset [&_svg]:size-3",
  {
    variants: {
      tone: {
        neutral: "bg-surface-2 text-fg-muted ring-border",
        brand: "bg-brand-soft text-brand-soft-fg ring-brand/20",
        success: "bg-success-soft text-success ring-success/25",
        warning:
          "bg-warning-soft text-[color-mix(in_oklch,var(--warning)_70%,var(--fg))] ring-warning/30",
        danger: "bg-danger-soft text-danger ring-danger/25",
        aff: "bg-aff-soft text-aff ring-aff/25",
        neg: "bg-neg-soft text-[color-mix(in_oklch,var(--neg)_75%,var(--fg))] ring-neg/30",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Side chip: colour + text label, never colour alone. */
export function SideBadge({
  side,
  labels,
  pending,
}: {
  side: "A" | "B" | null;
  labels: [string, string] | null;
  pending?: boolean;
}) {
  if (pending) return <Badge tone="neutral">Flip</Badge>;
  if (!side || !labels) return null;
  return <Badge tone={side === "A" ? "aff" : "neg"}>{side === "A" ? labels[0] : labels[1]}</Badge>;
}
