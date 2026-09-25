import { publicTournament, publishedRounds } from "@opentab/core";
import { db } from "@/lib/db";
import { json, limited, notFoundJson } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const l = limited(req);
  if (l) return l;
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) return notFoundJson();
  const t = data.tournament;
  return json({
    tournament: {
      slug: t.slug,
      name: t.name,
      startsOn: t.startsOn,
      endsOn: t.endsOn,
      location: t.location,
      timezone: t.timezone,
      status: t.status,
    },
    events: data.events,
    rounds: await publishedRounds(db(), t.id),
  });
}
