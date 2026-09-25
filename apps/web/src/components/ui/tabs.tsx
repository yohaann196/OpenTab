"use client";

import * as T from "@radix-ui/react-tabs";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = T.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof T.List>) {
  return (
    <T.List
      className={cn(
        "inline-flex h-9 items-center gap-1 rounded-lg bg-surface-2 p-1 text-fg-muted",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof T.Trigger>) {
  return (
    <T.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-soft [&_svg]:size-3.5",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = T.Content;
