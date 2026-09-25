"use client";

import { ThemeProvider } from "next-themes";
import type * as React from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-lg !border !border-border !bg-surface !text-fg !shadow-lift",
              description: "!text-fg-muted",
            },
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
