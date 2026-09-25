import { ballotBoard, loadRound, requireTournamentBySlug } from "@opentab/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { BallotBoard } from "./ballot-board";

export default async function BallotsPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string; roundId: string }>;
}) {
  const { slug, eventId, roundId } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const { role } = await requireStaff(t.id);
  const r = await loadRound(db(), roundId).catch(() => null);
  if (!r || r.eventId !== eventId) notFound();
  const board = await ballotBoard(db(), roundId);
  return (
    <div className="space-y-5">
      <Link
        href={`/tab/${slug}/events/${eventId}/rounds/${roundId}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> Back to draw
      </Link>
      <BallotBoard
        slug={slug}
        tournamentId={t.id}
        round={{ id: r.id, label: r.label, status: r.status }}
        board={JSON.parse(JSON.stringify(board))}
        canConfirm={role !== "viewer"}
      />
    </div>
  );
}
