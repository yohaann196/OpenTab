import {
  IMPORT_FIELDS,
  IMPORT_TEMPLATES,
  listSchools,
  requireTournamentBySlug,
} from "@opentab/core";
import { ImportDialog } from "@/components/tab/import-dialog";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { SchoolsTable } from "./schools-table";

export default async function SchoolsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const schools = await listSchools(db(), t.id);
  const entries = await db().query.entry.findMany({
    where: (e, { eq }) => eq(e.tournamentId, t.id),
    columns: { schoolId: true },
  });
  const judges = await db().query.judge.findMany({
    where: (j, { eq }) => eq(j.tournamentId, t.id),
    columns: { schoolId: true },
  });
  const counts = Object.fromEntries(
    schools.map((s) => [
      s.id,
      {
        entries: entries.filter((e) => e.schoolId === s.id).length,
        judges: judges.filter((j) => j.schoolId === s.id).length,
      },
    ]),
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Schools"
        description="Schools are used to avoid same-school pairings and to conflict judges from their own teams."
        actions={
          <ImportDialog
            slug={slug}
            tournamentId={t.id}
            kind="schools"
            fields={IMPORT_FIELDS.schools}
            template={IMPORT_TEMPLATES.schools}
          />
        }
      />
      <SchoolsTable slug={slug} tournamentId={t.id} schools={schools} counts={counts} />
    </div>
  );
}
