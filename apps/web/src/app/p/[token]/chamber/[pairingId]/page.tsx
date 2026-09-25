import { listSpeeches, loadRoundPairings, precedenceQueue } from "@opentab/core";
import { entry, pairing, pairingJudge } from "@opentab/db";
import { and, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getTokenActor } from "@/lib/session";
import { ChamberTracker } from "./chamber-tracker";

export const dynamic = "force-dynamic";

/** PO / parliamentarian tool: precedence & recency queue plus the speech log. */
export default async function ChamberPage({
  params,
}: {
  params: Promise<{ token: string; pairingId: string }>;
}) {
  const { token, pairingId } = await params;
  const t = await getTokenActor(token);
  if (!t || t.resolved.subjectType !== "judge") notFound();
  const [assigned] = await db()
    .select()
    .from(pairingJudge)
    .where(
      and(eq(pairingJudge.pairingId, pairingId), eq(pairingJudge.judgeId, t.resolved.subjectId)),
    );
  if (!assigned) notFound();
  const [p] = await db().select().from(pairing).where(eq(pairing.id, pairingId));
  const members =
    (await loadRoundPairings(db(), p!.roundId)).find((x) => x.id === pairingId)?.entries ?? [];
  const entries = members.length
    ? await db()
        .select({ id: entry.id, code: entry.code, name: entry.name })
        .from(entry)
        .where(
          inArray(
            entry.id,
            members.map((m) => m.entryId),
          ),
        )
    : [];
  const [queue, speeches] = await Promise.all([
    precedenceQueue(db(), pairingId),
    listSpeeches(db(), pairingId),
  ]);
  return (
    <div className="space-y-4">
      <Link
        href={`/p/${token}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> My rounds
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">{p!.label ?? "Chamber"} tracker</h1>
      <ChamberTracker
        token={token}
        pairingId={pairingId}
        entries={entries}
        queue={queue}
        speeches={speeches.map((s) => ({
          id: s.id,
          entryId: s.entryId,
          seq: s.seq,
          legislation: s.legislation,
          stance: s.stance,
        }))}
      />
    </div>
  );
}
