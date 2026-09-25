import { publicTournament, publishedStandings } from "@opentab/core";
import { db } from "@/lib/db";
import { json, limited, notFoundJson } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; eventId: string }> },
) {
  const l = limited(req);
  if (l) return l;
  const { slug, eventId } = await params;
  const data = await publicTournament(db(), slug);
  if (
    !data ||
    !data.events.some((e) => e.id === eventId) ||
    data.tournament.settings?.publicStandings === false
  )
    return notFoundJson();
  const view = await publishedStandings(db(), eventId);
  return view ? json(view, { maxAge: 30 }) : notFoundJson();
}
