import type { Finding } from "@opentab/engine";

export type DomainErrorCode =
  | "not_found"
  | "forbidden"
  | "invalid"
  | "conflict"
  | "unauthenticated";

/** Errors thrown by domain services; the web layer maps them to HTTP responses. */
export class DomainError extends Error {
  constructor(
    readonly code: DomainErrorCode,
    message: string,
    readonly findings: Finding[] = [],
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export const notFound = (what: string) => new DomainError("not_found", `${what} not found`);
export const forbidden = (msg = "You don't have permission to do that") =>
  new DomainError("forbidden", msg);
export const invalid = (msg: string, findings: Finding[] = []) =>
  new DomainError("invalid", msg, findings);

export function assertFound<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw notFound(what);
  return value;
}
