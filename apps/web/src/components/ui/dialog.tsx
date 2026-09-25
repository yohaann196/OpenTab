"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({
  className,
  children,
  title,
  description,
  size = "md",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const sizes = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-lift outline-none data-[state=open]:animate-slide-up",
          sizes[size],
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="space-y-1">
            <DialogPrimitive.Title className="text-base font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="text-sm text-fg-muted">
                {description}
              </DialogPrimitive.Description>
            ) : (
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close
            className="rounded-md p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetContent({
  className,
  children,
  title,
  description,
  side = "right",
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: string;
  description?: string;
  side?: "right" | "bottom" | "left";
}) {
  const sides = {
    right: "inset-y-0 right-0 h-full w-[min(28rem,100vw)] border-l",
    left: "inset-y-0 left-0 h-full w-[min(20rem,90vw)] border-r",
    bottom: "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t",
  };
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface shadow-lift outline-none data-[state=open]:animate-slide-up",
          sides[side],
          className,
        )}
        {...props}
      >
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={description ? "text-sm text-fg-muted" : "sr-only"}
            >
              {description ?? title}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close
            className="rounded-md p-1 text-fg-muted hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <X className="size-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
