import type { LucideIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-surface-3", className)} {...props} />;
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center",
        className,
      )}
    >
      <div className="grid size-11 place-items-center rounded-full bg-brand-soft text-brand-soft-fg">
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1">
        <h3 className="font-semibold">{title}</h3>
        {children && <div className="text-sm text-fg-muted">{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-2 px-1 font-mono text-[11px] text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function LiveDot({ className, label = "Live" }: { className?: string; label?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-success", className)}
    >
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-pulse-dot rounded-full bg-success" />
      </span>
      {label}
    </span>
  );
}

export function Stat({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4 shadow-soft", className)}>
      <div className="text-xs font-medium text-fg-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight tabular">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-fg-subtle">{sub}</div>}
    </div>
  );
}

export function Progress({
  value,
  className,
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "success";
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500",
          tone === "success" ? "bg-success" : "bg-brand",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow && (
          <div className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-fg-muted text-pretty">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({
  tone = "neutral",
  title,
  children,
  icon: Icon,
  className,
}: {
  tone?: "neutral" | "warning" | "danger" | "success" | "brand";
  title?: React.ReactNode;
  children?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const tones = {
    neutral: "border-border bg-surface-2",
    warning: "border-warning/40 bg-warning-soft",
    danger: "border-danger/30 bg-danger-soft",
    success: "border-success/30 bg-success-soft",
    brand: "border-brand/25 bg-brand-soft",
  } as const;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-lg border p-3 text-sm", tones[tone], className)}
    >
      {Icon && <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 space-y-0.5">
        {title && <div className="font-medium">{title}</div>}
        {children && <div className="text-fg-muted">{children}</div>}
      </div>
    </div>
  );
}
