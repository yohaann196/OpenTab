import {
  IMPORT_FIELDS,
  IMPORT_TEMPLATES,
  listJudges,
  listSchools,
  listTimeslots,
  requireTournamentBySlug,
} from "@opentab/core";
import { judgeBlock } from "@opentab/db";
import { inArray } from "drizzle-orm";
import { Download } from "lucide-react";
import { ImportDialog } from "@/components/tab/import-dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { JudgesTable } from "./judges-table";

export default async function JudgesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const [judges, schools, timeslots] = await Promise.all([
    listJudges(db(), t.id),
    listSchools(db(), t.id),
    listTimeslots(db(), t.id),
  ]);
  const blocks = judges.length
    ? await db()
        .select()
        .from(judgeBlock)
        .where(
          inArray(
            judgeBlock.judgeId,
            judges.map((j) => j.id),
          ),
        )
    : [];
  return (
    <div className="space-y-6">
      <PageHeader
        title="Judges"
        description="Tab rating (0–10) helps place experienced judges on important debates. Rounds owed drives obligation balancing."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/tab/${slug}/export/judges`}>
                <Download /> Export
              </a>
            </Button>
            <ImportDialog
              slug={slug}
              tournamentId={t.id}
              kind="judges"
              fields={IMPORT_FIELDS.judges}
              template={IMPORT_TEMPLATES.judges}
            />
          </>
        }
      />
      <JudgesTable
        slug={slug}
        tournamentId={t.id}
        judges={judges.map((j) => ({
          ...j,
          checkedInAt: j.checkedInAt?.toISOString() ?? null,
          createdAt: undefined,
        }))}
        schools={schools.map((s) => ({ id: s.id, name: s.name }))}
        timeslots={timeslots.map((s) => ({ id: s.id, label: s.label }))}
        blocks={blocks}
      />
    </div>
  );
}
