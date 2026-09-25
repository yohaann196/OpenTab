import { findInPairings, publicTournament } from "@opentab/core";
import { db } from "@/lib/db";
import { json, limited, notFoundJson } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const l = limited(req);
  if (l) return l;
  const { slug } = await params;
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 80);
  const data = await publicTournament(db(), slug);
  if (!data) return notFoundJson();
  return json({ results: await findInPairings(db(), data.tournament.id, q) }, { maxAge: 5 });
}
