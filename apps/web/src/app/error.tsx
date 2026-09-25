"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="grid min-h-[60dvh] place-items-center px-4">
      <div className="max-w-md space-y-5 text-center">
        <TriangleAlert className="mx-auto size-10 text-warning" aria-hidden />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
          <p className="text-fg-muted">
            That&apos;s on us. Your data is safe — try again, and if it keeps happening, let the tab
            room know.
            {error.digest && (
              <span className="mt-2 block font-mono text-xs text-fg-subtle">
                Reference: {error.digest}
              </span>
            )}
          </p>
        </div>
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
      </div>
    </main>
  );
}
