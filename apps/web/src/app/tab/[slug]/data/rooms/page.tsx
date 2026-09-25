import { IMPORT_FIELDS, IMPORT_TEMPLATES, listRooms, requireTournamentBySlug } from "@opentab/core";
import { ImportDialog } from "@/components/tab/import-dialog";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { RoomsTable } from "./rooms-table";

export default async function RoomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const rooms = await listRooms(db(), t.id);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Rooms"
        description="Higher-priority rooms go to the most important debates. Accessible rooms are reserved for entries that need them."
        actions={
          <ImportDialog
            slug={slug}
            tournamentId={t.id}
            kind="rooms"
            fields={IMPORT_FIELDS.rooms}
            template={IMPORT_TEMPLATES.rooms}
          />
        }
      />
      <RoomsTable slug={slug} tournamentId={t.id} rooms={rooms} />
    </div>
  );
}
