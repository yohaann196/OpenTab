import {
  computeStandings,
  entriesCsv,
  fullExport,
  getRole,
  getTournamentBySlug,
  judgesCsv,
  speakersCsv,
  standingsCsv,
} from "@opentab/core";
import { db } from "@/lib/db";
import { getUserActor } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Tab-staff exports: CSV for entries, judges, standings; full JSON for everything. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; kind: string }> },
) {
  const { slug, kind } = await params;
  const actor = await getUserActor();
  if (!actor) return new Response("Sign in required", { status: 401 });
  const t = await getTournamentBySlug(db(), slug);
  if (!t) return new Response("Not found", { status: 404 });
  const role = await getRole(db(), actor, t.id);
  if (!role) return new Response("Forbidden", { status: 403 });

  const url = new URL(req.url);
  const eventId = url.searchParams.get("event");
  const csv = (body: string, name: string) =>
    new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${slug}-${name}.csv"`,
      },
    });

  switch (kind) {
    case "entries":
      return csv(await entriesCsv(db(), t.id), "entries");
    case "judges":
      return csv(await judgesCsv(db(), t.id), "judges");
    case "standings":
    case "speakers": {
      if (!eventId) return new Response("Missing ?event=", { status: 400 });
      const view = await computeStandings(db(), eventId);
      return csv(kind === "standings" ? standingsCsv(view) : speakersCsv(view), kind);
    }
    case "json":
      return new Response(JSON.stringify(await fullExport(db(), t.id), null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${slug}-export.json"`,
        },
      });
    default:
      return new Response("Unknown export", { status: 404 });
  }
}
