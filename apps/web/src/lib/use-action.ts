"use client";

import type { Finding } from "@opentab/engine";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionResult } from "./actions";

/**
 * Runs a server action in a transition with toasts for success and failure.
 * Returns the findings (warnings/errors) from the last call.
 */
export function useAction() {
  const [pending, startTransition] = useTransition();
  const [findings, setFindings] = useState<Finding[]>([]);

  const exec = useCallback(
    <T>(
      fn: () => Promise<ActionResult<T>>,
      opts: { success?: string | ((data: T) => string); quiet?: boolean } = {},
    ) =>
      new Promise<ActionResult<T>>((resolve) => {
        startTransition(async () => {
          const res = await fn();
          if (res.ok) {
            setFindings([]);
            const msg =
              typeof opts.success === "function"
                ? opts.success(res.data)
                : (opts.success ?? res.message);
            if (msg && !opts.quiet) toast.success(msg);
          } else {
            setFindings(res.findings ?? []);
            toast.error(res.error, {
              description: res.findings?.length
                ? `${res.findings.length} issue${res.findings.length === 1 ? "" : "s"} — see details.`
                : undefined,
            });
          }
          resolve(res);
        });
      }),
    [],
  );

  return { exec, pending, findings, setFindings };
}
