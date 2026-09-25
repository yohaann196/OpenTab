import "server-only";
import { DomainError } from "@opentab/core";
import type { Finding } from "@opentab/engine";
import { ZodError } from "zod";

export type ActionResult<T = null> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; findings?: Finding[]; fieldErrors?: Record<string, string> };

/** Runs a server-action body, converting domain/validation errors to results. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (err) {
    if (err instanceof DomainError)
      return { ok: false, error: err.message, findings: err.findings };
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) fieldErrors[issue.path.join(".")] ??= issue.message;
      return { ok: false, error: err.issues[0]?.message ?? "Invalid input", fieldErrors };
    }
    // Next.js control flow (redirect/notFound) must propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}
