import "server-only";
import { getBallotContext } from "@opentab/core";
import type { BallotFormData } from "@/components/ballot/types";
import { db } from "./db";

export async function ballotFormData(ballotId: string): Promise<BallotFormData> {
  const ctx = await getBallotContext(db(), ballotId);
  return {
    ballotId: ctx.ballot.id,
    status: ctx.ballot.status,
    version: ctx.ballot.version,
    roundLabel: ctx.round.label,
    eventName: ctx.event.name,
    roomName: ctx.room?.name ?? null,
    onlineUrl: ctx.room?.onlineUrl ?? null,
    motion: ctx.round.motionReleased ? ctx.round.motion : null,
    judgeName: ctx.judge.name,
    config: ctx.config,
    sidesPending: ctx.pairing.sidesPending,
    entries: ctx.entries.map((e) => ({
      id: e.id,
      code: e.code,
      side: e.side,
      competitors: e.competitors,
    })),
    winnerId: ctx.ballot.winnerEntryId,
    rfd: ctx.ballot.rfd,
    comments: ctx.ballot.feedback?.comments ?? {},
    rfdDeadline: ctx.ballot.rfdDeadline?.toISOString() ?? null,
    scores: ctx.scores.map((s) => ({
      entryId: s.entryId,
      competitorId: s.competitorId,
      position: s.position,
      reply: s.reply,
      points: s.points,
      rank: s.rank,
      components: s.components ?? null,
    })),
    congress: ctx.ballot.congress ?? null,
  };
}
