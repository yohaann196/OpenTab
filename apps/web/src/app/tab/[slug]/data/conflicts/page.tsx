import {
  listConflicts,
  listEntries,
  listJudges,
  listSchools,
  requireTournamentBySlug,
} from "@opentab/core";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { ConflictsTable } from "./conflicts-table";

export default async function ConflictsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const [conflicts, judges, entries, schools] = await Promise.all([
    listConflicts(db(), t.id),
    listJudges(db(), t.id),
    listEntries(db(), t.id),
    listSchools(db(), t.id),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Conflicts & strikes"
        description="A conflicted or struck judge is never placed on a debate with that entry or school. Own-school conflicts are automatic."
      />
      <ConflictsTable
        slug={slug}
        tournamentId={t.id}
        conflicts={conflicts.map((c) => ({
          id: c.conflict.id,
          kind: c.conflict.kind,
          source: c.conflict.source,
          judgeName: c.judgeName,
          target: c.entryCode ?? c.schoolName ?? "—",
          targetType: c.conflict.entryId ? "entry" : "school",
        }))}
        judges={judges.map((j) => ({ id: j.id, name: j.name }))}
        entries={entries.map((e) => ({ id: e.id, label: `${e.eventAbbr} · ${e.code}` }))}
        schools={schools.map((s) => ({ id: s.id, name: s.name }))}
      />
    </div>
  );
}
