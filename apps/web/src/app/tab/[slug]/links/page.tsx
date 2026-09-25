import { linksFor, listEntries, listJudges, requireTournamentBySlug } from "@opentab/core";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { LinksClient } from "./links-client";

export default async function LinksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const [judges, entries, jl, el] = await Promise.all([
    listJudges(db(), t.id),
    listEntries(db(), t.id),
    linksFor(db(), t.id, "judge"),
    linksFor(db(), t.id, "entry"),
  ]);
  const jt = new Map(jl.map((l) => [l.subjectId, l]));
  const et = new Map(el.map((l) => [l.subjectId, l]));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Private links"
        description="Every judge and entry gets a private link — no account or password. Judges submit ballots; entries see their rounds, submit pref sheets and read released ballots."
      />
      <LinksClient
        slug={slug}
        tournamentId={t.id}
        appUrl={env.appUrl}
        judges={judges.map((j) => ({
          id: j.id,
          name: j.name,
          sub: j.schoolName ?? "Hired",
          email: j.email,
          token: jt.get(j.id)?.token ?? null,
          lastUsedAt: jt.get(j.id)?.lastUsedAt?.toISOString() ?? null,
        }))}
        entries={entries.map((e) => ({
          id: e.id,
          name: e.code,
          sub: `${e.eventAbbr} · ${e.competitors.map((c) => c.name).join(", ")}`,
          email: e.competitors.find((c) => c.email)?.email ?? null,
          token: et.get(e.id)?.token ?? null,
          lastUsedAt: et.get(e.id)?.lastUsedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
