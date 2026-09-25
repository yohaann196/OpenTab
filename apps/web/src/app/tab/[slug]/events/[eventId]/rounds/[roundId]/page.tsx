import { drawEditorData, requireTournamentBySlug } from "@opentab/core";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { DrawEditor } from "./draw-editor";

export default async function RoundPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string; roundId: string }>;
}) {
  const { slug, eventId, roundId } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const { role } = await requireStaff(t.id);
  const data = await drawEditorData(db(), roundId).catch(() => null);
  if (!data || data.event.id !== eventId) notFound();
  return (
    <DrawEditor
      slug={slug}
      tournamentId={t.id}
      data={data}
      canEdit={role !== "viewer" && role !== "checker"}
    />
  );
}
