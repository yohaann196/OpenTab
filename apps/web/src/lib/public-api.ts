import "server-only";
import { rateLimit } from "./rate-limit";

/**
 * Public API helpers: CORS-open, CDN-cacheable, rate-limited JSON responses.
 * Published data changes rarely, so a short s-maxage with a long
 * stale-while-revalidate keeps origin load flat during peak rounds.
 */
export function json(data: unknown, init: { status?: number; maxAge?: number } = {}) {
  const maxAge = init.maxAge ?? 10;
  return new Response(JSON.stringify(data), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        init.status && init.status >= 400
          ? "no-store"
          : `public, max-age=${Math.min(maxAge, 5)}, s-maxage=${maxAge}, stale-while-revalidate=300`,
    },
  });
}

export function limited(req: Request): Response | null {
  if (!rateLimit(req, "public-api", 240))
    return json(
      { error: "Rate limit exceeded. Please cache responses or slow down." },
      { status: 429 },
    );
  return null;
}

export const notFoundJson = () => json({ error: "Not found" }, { status: 404 });
