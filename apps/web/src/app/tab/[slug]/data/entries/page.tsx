import {
  IMPORT_FIELDS,
  IMPORT_TEMPLATES,
  listEntries,
  listEvents,
  listSchools,
  requireTournamentBySlug,
} from "@opentab/core";
import { Download } from "lucide-react";
import { ImportDialog } from "@/components/tab/import-dialog";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { EntriesTable } from "./entries-table";

export default async function EntriesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const [entries, events, schools] = await Promise.all([
    listEntries(db(), t.id),
    listEvents(db(), t.id),
    listSchools(db(), t.id),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Entries"
        description="Teams and individual competitors. Drop an entry to remove it from future pairings without losing its results."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/tab/${slug}/export/entries`}>
                <Download /> Export
              </a>
            </Button>
            <ImportDialog
              slug={slug}
              tournamentId={t.id}
              kind="entries"
              fields={IMPORT_FIELDS.entries}
              template={IMPORT_TEMPLATES.entries}
            />
          </>
        }
      />
      <EntriesTable
        slug={slug}
        tournamentId={t.id}
        entries={entries}
        events={events.map((e) => ({
          id: e.id,
          abbreviation: e.abbreviation,
          name: e.name,
          teamSize:
            e.format === "congress" ? 1 : ((e.config as { teamSize?: number }).teamSize ?? 1),
        }))}
        schools={schools.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
      />
    </div>
  );
}
