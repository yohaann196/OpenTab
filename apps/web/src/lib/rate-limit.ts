import "server-only";

/**
 * Small in-memory fixed-window rate limiter keyed by client IP. Good enough to
 * blunt abuse of public endpoints on a single instance; put a CDN/WAF in front
 * for fleet-wide limits.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

export function rateLimit(req: Request, name: string, perMinute: number): boolean {
  const key = `${name}:${clientIp(req)}`;
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + 60_000 });
    if (buckets.size > 50_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return true;
  }
  b.count++;
  return b.count <= perMinute;
}
