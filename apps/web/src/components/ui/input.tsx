import type * as React from "react";
import { cn } from "@/lib/utils";

export const fieldClass =
  "w-full rounded-md border border-border bg-surface px-3 text-sm text-fg shadow-[inset_0_1px_1px_rgb(0_0_0/0.03)] outline-none transition placeholder:text-fg-subtle focus:border-brand focus:ring-4 focus:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-danger";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, "h-9", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(fieldClass, "min-h-24 py-2 leading-relaxed", className)} {...props} />
  );
}

export function NativeSelect({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        fieldClass,
        "h-9 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%23888%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:12px] bg-[right_0.75rem_center] bg-no-repeat pr-8",
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  // biome-ignore lint/a11y/noLabelWithoutControl: consumers pass htmlFor or nest the control
  return <label className={cn("text-sm font-medium text-fg", className)} {...props} />;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-xs text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  );
}
