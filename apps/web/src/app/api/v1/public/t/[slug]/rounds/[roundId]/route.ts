import { pairingsSnapshot, publicTournament } from "@opentab/core";
import { db } from "@/lib/db";
import { json, limited, notFoundJson } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; roundId: string }> },
) {
  const l = limited(req);
  if (l) return l;
  const { slug, roundId } = await params;
  const data = await publicTournament(db(), slug);
  if (!data || !/^[0-9a-f-]{36}$/i.test(roundId)) return notFoundJson();
  const snap = await pairingsSnapshot(db(), roundId);
  if (!snap || !data.events.some((e) => e.id === snap.round.eventId)) return notFoundJson();
  return json(snap, { maxAge: 5 });
}
