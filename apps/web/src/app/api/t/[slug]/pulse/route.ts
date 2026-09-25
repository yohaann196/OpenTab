import { getTournamentBySlug, livePulse } from "@opentab/core";
import { after } from "next/server";
import { db } from "@/lib/db";
import { sweepDuePublishes } from "@/lib/queue";

export const dynamic = "force-dynamic";

/**
 * Change counter for polling clients (LIVE_MODE=poll, used on serverless
 * hosts where a LISTEN connection can't be held open). Tiny and edge-cached
 * for a couple of seconds so thousands of phones cost one query.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTournamentBySlug(db(), slug);
  if (!t || t.visibility === "private") return new Response("Not found", { status: 404 });
  after(sweepDuePublishes);
  return Response.json(await livePulse(db(), t.id), {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=2" },
  });
}
