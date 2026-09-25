/** The app's sub-path (e.g. "/opentab"), or "" at the domain root. */
export const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Prefixes a root-relative path with the base path. Needed for raw URLs
 * (fetch, EventSource, <a href>, service worker) — next/link, the router and
 * redirect() already add it.
 */
export function withBase(path: string): string {
  return `${basePath}${path}`;
}

/** Only allow same-site relative redirects (blocks `//evil.com` and absolute URLs). */
export function safeNext(next: string | null | undefined, fallback = "/tab"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
