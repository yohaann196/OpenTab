import {
  ballot,
  type CongressBallotData,
  competitor,
  type Db,
  entry,
  event,
  judge,
  pairing,
  pairingEntry,
  pairingJudge,
  type Queryable,
  room,
  round,
  speakerScore,
  tournament,
} from "@opentab/db";
import {
  type CongressConfig,
  type DebateConfig,
  decideDebate,
  type EventConfig,
  isDebateConfig,
  validateCongressBallot,
  validateTwoTeamBallot,
} from "@opentab/engine";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { getRole, roleAtLeast } from "./authz";
import { assertFound, DomainError, forbidden, invalid } from "./errors";
import { loadDebateResults } from "./loaders";
import { emit } from "./realtime";

/**
 * Ballots. Judges submit from their private link (phone-first); the tab room
 * can enter paper ballots. The decision can be submitted before the RFD is
 * finished — the RFD stays editable until the grace deadline.
 */

export const scoreInput = z.object({
  entryId: z.uuid(),
  competitorId: z.uuid(),
  position: z.number().int().min(1).max(8),
  reply: z.boolean().default(false),
  points: z.number().min(0).max(100),
  rank: z.number().int().min(1).max(20).nullable().optional(),
  components: z
    .object({ style: z.number(), content: z.number(), strategy: z.number() })
    .nullable()
    .optional(),
});

export const ballotInput = z.object({
  winnerId: z.uuid().nullable().optional(),
  scores: z.array(scoreInput).max(20).default([]),
  rfd: z.string().max(20000).nullable().optional(),
  comments: z.record(z.string(), z.string().max(10000)).optional(),
  congress: z
    .object({
      speeches: z.array(z.object({ entryId: z.uuid(), points: z.number().int() })).max(200),
      ranks: z.array(z.object({ entryId: z.uuid(), rank: z.number().int() })).max(40),
      po: z.object({ entryId: z.uuid(), points: z.number().int() }).nullable().optional(),
    })
    .optional(),
  /** Sides recorded after an in-room coin flip (entryId → side). */
  sides: z.record(z.string(), z.enum(["A", "B"])).optional(),
  /** Acknowledge warnings (e.g. low-point win). */
  acknowledgeWarnings: z.boolean().default(false),
  /** Optimistic concurrency: the version the client edited. */
  expectedVersion: z.number().int().optional(),
});
export type BallotInput = z.input<typeof ballotInput>;

/** Everything needed to render a ballot form. */
export async function getBallotContext(db: Queryable, ballotId: string) {
  const [b] = await db.select().from(ballot).where(eq(ballot.id, ballotId));
  const bal = assertFound(b, "Ballot");
  const [p] = await db.select().from(pairing).where(eq(pairing.id, bal.pairingId));
  const pr = assertFound(p, "Debate");
  const [r] = await db.select().from(round).where(eq(round.id, pr.roundId));
  const [ev] = await db.select().from(event).where(eq(event.id, r!.eventId));
  const [t] = await db.select().from(tournament).where(eq(tournament.id, r!.tournamentId));
  const [j] = await db.select().from(judge).where(eq(judge.id, bal.judgeId));
  const [rm] = pr.roomId ? await db.select().from(room).where(eq(room.id, pr.roomId)) : [];
  const pes = await db
    .select()
    .from(pairingEntry)
    .where(eq(pairingEntry.pairingId, pr.id))
    .orderBy(asc(pairingEntry.side), asc(pairingEntry.position));
  const entries = pes.length
    ? await db
        .select()
        .from(entry)
        .where(
          inArray(
            entry.id,
            pes.map((x) => x.entryId),
          ),
        )
    : [];
  const comps = pes.length
    ? await db
        .select()
        .from(competitor)
        .where(
          inArray(
            competitor.entryId,
            pes.map((x) => x.entryId),
          ),
        )
        .orderBy(asc(competitor.sort))
    : [];
  const scores = await db.select().from(speakerScore).where(eq(speakerScore.ballotId, bal.id));
  const panel = await db
    .select({ judgeId: pairingJudge.judgeId, role: pairingJudge.role, name: judge.name })
    .from(pairingJudge)
    .innerJoin(judge, eq(judge.id, pairingJudge.judgeId))
    .where(eq(pairingJudge.pairingId, pr.id));
  return {
    ballot: bal,
    pairing: pr,
    round: r!,
    event: ev!,
    tournament: t!,
    judge: j!,
    room: rm ?? null,
    config: ev!.config as EventConfig,
    panel,
    entries: pes.map((pe) => {
      const e = entries.find((x) => x.id === pe.entryId)!;
      return {
        id: e.id,
        code: e.code,
        name: e.name,
        side: pe.side,
        position: pe.position,
        competitors: comps
          .filter((c) => c.entryId === e.id)
          .map((c) => ({ id: c.id, name: c.name })),
      };
    }),
    scores,
  };
}
export type BallotContext = Awaited<ReturnType<typeof getBallotContext>>;

async function authorizeBallot(
  db: Queryable,
  actor: Actor,
  ctx: BallotContext,
): Promise<"judge" | "tab"> {
  if (actor.kind === "token") {
    if (
      actor.subjectType === "judge" &&
      actor.subjectId === ctx.ballot.judgeId &&
      actor.tournamentId === ctx.round.tournamentId
    ) {
      return "judge";
    }
    throw forbidden("This isn't your ballot");
  }
  if (actor.kind === "user") {
    if (ctx.judge.userId && ctx.judge.userId === actor.userId) return "judge";
    const role = await getRole(db, actor, ctx.round.tournamentId);
    if (role && roleAtLeast(role, "checker")) return "tab";
  }
  if (actor.kind === "system") return "tab";
  throw forbidden();
}

function validate(ctx: BallotContext, input: z.infer<typeof ballotInput>) {
  if (ctx.config.format === "congress") {
    return validateCongressBallot(
      input.congress ?? { speeches: [], ranks: [] },
      ctx.entries.map((e) => e.id),
      ctx.config as CongressConfig,
    );
  }
  return validateTwoTeamBallot(
    {
      winnerId: input.winnerId ?? null,
      scores: input.scores.map((s) => ({
        ...s,
        rank: s.rank ?? null,
        components: s.components ?? undefined,
      })),
    },
    {
      entries: ctx.entries.map((e) => ({ entryId: e.id, side: (e.side ?? "A") as "A" | "B" })),
      competitors: Object.fromEntries(
        ctx.entries.map((e) => [e.id, e.competitors.map((c) => c.id)]),
      ),
    },
    ctx.config as DebateConfig,
  );
}

/** Save a draft or submit a ballot. */
export async function saveBallot(
  db: Db,
  actor: Actor,
  ballotId: string,
  raw: BallotInput,
  mode: "draft" | "submit",
) {
  const input = ballotInput.parse(raw);
  return db.transaction(async (tx) => {
    const ctx = await getBallotContext(tx, ballotId);
    const as = await authorizeBallot(tx, actor, ctx);
    if (ctx.round.status === "draft") throw invalid("This round hasn't been published");
    if (input.expectedVersion !== undefined && input.expectedVersion !== ctx.ballot.version) {
      throw new DomainError(
        "conflict",
        "This ballot was changed elsewhere. Reload to see the latest version.",
      );
    }
    const locked =
      ctx.ballot.status === "confirmed" || (ctx.ballot.status === "submitted" && as === "judge");
    if (locked)
      throw invalid(
        "This ballot has already been submitted. Request a correction from the tab room.",
      );

    const v = validate(ctx, input);
    if (mode === "submit") {
      if (v.errors.length) throw invalid("Please fix the highlighted problems", v.errors);
      if (v.warnings.length && !input.acknowledgeWarnings) {
        throw new DomainError(
          "invalid",
          "Please confirm the warnings before submitting",
          v.warnings,
        );
      }
      if (isDebateConfig(ctx.config) && ctx.config.ballot.requireRfd && !input.rfd?.trim()) {
        throw invalid("An RFD is required for this event");
      }
    }

    const now = new Date();
    const graceHours = isDebateConfig(ctx.config) ? ctx.config.ballot.rfdGraceHours : 24;
    const status = mode === "submit" ? (as === "tab" ? "confirmed" : "submitted") : "draft";
    const [after] = await tx
      .update(ballot)
      .set({
        status,
        winnerEntryId: input.winnerId ?? null,
        rfd: input.rfd ?? null,
        feedback: {
          ...ctx.ballot.feedback,
          comments: input.comments ?? ctx.ballot.feedback.comments,
        },
        congress: (input.congress as CongressBallotData | undefined) ?? null,
        source: as === "tab" ? "tab" : "judge",
        enteredByUserId: actor.kind === "user" ? actor.userId : null,
        startedAt: ctx.ballot.startedAt ?? now,
        submittedAt: mode === "submit" ? now : null,
        confirmedAt: status === "confirmed" ? now : null,
        rfdDeadline: mode === "submit" ? new Date(now.getTime() + graceHours * 3600_000) : null,
        version: ctx.ballot.version + 1,
      })
      .where(eq(ballot.id, ballotId))
      .returning();

    await tx.delete(speakerScore).where(eq(speakerScore.ballotId, ballotId));
    if (input.scores.length && ctx.config.format !== "congress") {
      await tx.insert(speakerScore).values(
        input.scores.map((s) => ({
          ballotId,
          entryId: s.entryId,
          competitorId: s.competitorId,
          position: s.position,
          reply: s.reply,
          points: s.points,
          rank: s.rank ?? null,
          components: s.components ?? null,
        })),
      );
    }
    if (mode === "submit" && ctx.pairing.sidesPending && input.sides) {
      const assigned = ctx.entries.map((e) => input.sides?.[e.id]);
      if (assigned.every(Boolean) && new Set(assigned).size === ctx.entries.length) {
        for (const e of ctx.entries) {
          await tx
            .update(pairingEntry)
            .set({ side: input.sides[e.id]! })
            .where(and(eq(pairingEntry.pairingId, ctx.pairing.id), eq(pairingEntry.entryId, e.id)));
        }
        await tx.update(pairing).set({ sidesPending: false }).where(eq(pairing.id, ctx.pairing.id));
      }
    }
    if (mode === "submit") await refreshDecision(tx, ctx.pairing.id, ctx.round.eventId);
    if (mode === "submit" || as === "tab") {
      await audit(tx, actor, {
        tournamentId: ctx.round.tournamentId,
        action: mode === "submit" ? "ballot.submit" : "ballot.draft",
        entityType: "ballot",
        entityId: ballotId,
        summary: `${ctx.round.label}: ballot from ${ctx.judge.name} ${mode === "submit" ? "submitted" : "saved"}${as === "tab" ? " by tab" : ""}`,
        before: ctx.ballot,
        after,
      });
    }
    await emit(tx, ctx.round.tournamentId, {
      type: "ballot.updated",
      roundId: ctx.round.id,
      pairingId: ctx.pairing.id,
      status,
    });
    return { ballot: after!, warnings: v.warnings };
  });
}

/** Recomputes and caches a debate's decision from its submitted ballots. */
export async function refreshDecision(tx: Queryable, pairingId: string, eventId: string) {
  const results = await loadDebateResults(tx, eventId, { stage: "all" });
  const res = results.find((d) => d.pairingId === pairingId);
  const all = await tx.select().from(ballot).where(eq(ballot.pairingId, pairingId));
  const complete = all.every((b) => b.status === "submitted" || b.status === "confirmed");
  const winner = res && complete ? decideDebate(res) : null;
  await tx.update(pairing).set({ winnerEntryId: winner }).where(eq(pairing.id, pairingId));
}

/** Judges may finish the RFD until the grace deadline; the tab room anytime. */
export async function updateRfd(
  db: Db,
  actor: Actor,
  ballotId: string,
  rfd: string,
  comments?: Record<string, string>,
) {
  return db.transaction(async (tx) => {
    const ctx = await getBallotContext(tx, ballotId);
    const as = await authorizeBallot(tx, actor, ctx);
    if (as === "judge") {
      if (!ctx.ballot.rfdDeadline || ctx.ballot.rfdDeadline.getTime() < Date.now()) {
        throw invalid("The RFD editing window for this ballot has closed");
      }
    }
    await tx
      .update(ballot)
      .set({
        rfd,
        feedback: { ...ctx.ballot.feedback, comments: comments ?? ctx.ballot.feedback.comments },
        version: ctx.ballot.version + 1,
      })
      .where(eq(ballot.id, ballotId));
  });
}

export async function markStarted(db: Db, actor: Actor, ballotId: string) {
  const ctx = await getBallotContext(db, ballotId);
  await authorizeBallot(db, actor, ctx);
  if (ctx.ballot.startedAt) return;
  await db
    .update(ballot)
    .set({ startedAt: new Date(), acceptedAt: ctx.ballot.acceptedAt ?? new Date() })
    .where(eq(ballot.id, ballotId));
  await db
    .update(pairing)
    .set({ startedAt: new Date() })
    .where(and(eq(pairing.id, ctx.pairing.id)));
  await emit(db, ctx.round.tournamentId, {
    type: "ballot.updated",
    roundId: ctx.round.id,
    pairingId: ctx.pairing.id,
    status: "started",
  });
}

export async function requestCorrection(db: Db, actor: Actor, ballotId: string, message: string) {
  const ctx = await getBallotContext(db, ballotId);
  await authorizeBallot(db, actor, ctx);
  await db
    .update(ballot)
    .set({ correctionRequest: message.slice(0, 2000) })
    .where(eq(ballot.id, ballotId));
  await audit(db, actor, {
    tournamentId: ctx.round.tournamentId,
    action: "ballot.correction",
    entityType: "ballot",
    entityId: ballotId,
    summary: `${ctx.judge.name} requested a correction: ${message.slice(0, 120)}`,
  });
  await emit(db, ctx.round.tournamentId, {
    type: "ballot.updated",
    roundId: ctx.round.id,
    pairingId: ctx.pairing.id,
    status: "correction",
  });
}

export async function setBallotStatus(
  db: Db,
  actor: Actor,
  ballotId: string,
  status: "confirmed" | "draft",
) {
  return db.transaction(async (tx) => {
    const ctx = await getBallotContext(tx, ballotId);
    const as = await authorizeBallot(tx, actor, ctx);
    if (as !== "tab") throw forbidden();
    await tx
      .update(ballot)
      .set({
        status,
        confirmedAt: status === "confirmed" ? new Date() : null,
        correctionRequest: status === "draft" ? null : ctx.ballot.correctionRequest,
        version: ctx.ballot.version + 1,
      })
      .where(eq(ballot.id, ballotId));
    await refreshDecision(tx, ctx.pairing.id, ctx.round.eventId);
    await audit(tx, actor, {
      tournamentId: ctx.round.tournamentId,
      action: `ballot.${status === "draft" ? "reopen" : "confirm"}`,
      entityType: "ballot",
      entityId: ballotId,
      summary: `${status === "draft" ? "Reopened" : "Confirmed"} ${ctx.judge.name}'s ballot in ${ctx.round.label}`,
    });
    await emit(tx, ctx.round.tournamentId, {
      type: "ballot.updated",
      roundId: ctx.round.id,
      pairingId: ctx.pairing.id,
      status,
    });
  });
}

/** Tab room ballot board for a round. */
export async function ballotBoard(db: Queryable, roundId: string) {
  const ps = await db
    .select()
    .from(pairing)
    .where(eq(pairing.roundId, roundId))
    .orderBy(asc(pairing.flight), asc(pairing.sort));
  if (ps.length === 0)
    return {
      rows: [],
      counts: { total: 0, pending: 0, draft: 0, submitted: 0, confirmed: 0, started: 0 },
    };
  const ids = ps.map((p) => p.id);
  const bs = await db
    .select({ ballot, judgeName: judge.name })
    .from(ballot)
    .innerJoin(judge, eq(judge.id, ballot.judgeId))
    .where(inArray(ballot.pairingId, ids));
  const pes = await db
    .select({
      pairingId: pairingEntry.pairingId,
      entryId: pairingEntry.entryId,
      side: pairingEntry.side,
      code: entry.code,
    })
    .from(pairingEntry)
    .innerJoin(entry, eq(entry.id, pairingEntry.entryId))
    .where(inArray(pairingEntry.pairingId, ids));
  const roomIds = ps.map((p) => p.roomId).filter((x): x is string => !!x);
  const rooms = roomIds.length ? await db.select().from(room).where(inArray(room.id, roomIds)) : [];
  const counts = { total: bs.length, pending: 0, draft: 0, submitted: 0, confirmed: 0, started: 0 };
  for (const b of bs) {
    counts[b.ballot.status]++;
    if (b.ballot.startedAt) counts.started++;
  }
  return {
    counts,
    rows: ps.map((p) => ({
      pairingId: p.id,
      label: p.label,
      flight: p.flight,
      bye: p.bye,
      room: rooms.find((r) => r.id === p.roomId)?.name ?? null,
      winnerEntryId: p.winnerEntryId,
      entries: pes
        .filter((e) => e.pairingId === p.id)
        .sort((a, b) => (a.side ?? "Z").localeCompare(b.side ?? "Z")),
      ballots: bs
        .filter((b) => b.ballot.pairingId === p.id)
        .map((b) => ({
          id: b.ballot.id,
          judgeId: b.ballot.judgeId,
          judgeName: b.judgeName,
          status: b.ballot.status,
          winnerEntryId: b.ballot.winnerEntryId,
          startedAt: b.ballot.startedAt,
          submittedAt: b.ballot.submittedAt,
          source: b.ballot.source,
          correctionRequest: b.ballot.correctionRequest,
          hasRfd: !!b.ballot.rfd,
        })),
    })),
  };
}

/** A judge's assignments across published rounds (judge portal). */
export async function judgeAssignments(db: Queryable, judgeId: string) {
  const rows = await db
    .select({
      pairing,
      round,
      eventName: event.name,
      eventAbbr: event.abbreviation,
      format: event.format,
      config: event.config,
      role: pairingJudge.role,
    })
    .from(pairingJudge)
    .innerJoin(pairing, eq(pairing.id, pairingJudge.pairingId))
    .innerJoin(round, eq(round.id, pairing.roundId))
    .innerJoin(event, eq(event.id, round.eventId))
    .where(
      and(eq(pairingJudge.judgeId, judgeId), inArray(round.status, ["published", "completed"])),
    )
    .orderBy(desc(round.publishedAt));
  if (rows.length === 0) return [];
  const pIds = rows.map((r) => r.pairing.id);
  const bs = await db
    .select()
    .from(ballot)
    .where(and(inArray(ballot.pairingId, pIds), eq(ballot.judgeId, judgeId)));
  const pes = await db
    .select({
      pairingId: pairingEntry.pairingId,
      side: pairingEntry.side,
      code: entry.code,
      name: entry.name,
      position: pairingEntry.position,
    })
    .from(pairingEntry)
    .innerJoin(entry, eq(entry.id, pairingEntry.entryId))
    .where(inArray(pairingEntry.pairingId, pIds));
  const roomIds = rows.map((r) => r.pairing.roomId).filter((x): x is string => !!x);
  const rooms = roomIds.length ? await db.select().from(room).where(inArray(room.id, roomIds)) : [];
  return rows.map((r) => {
    const cfg = r.config as EventConfig;
    return {
      pairingId: r.pairing.id,
      roundId: r.round.id,
      roundLabel: r.round.label,
      roundStatus: r.round.status,
      startsAt: r.round.startsAt,
      motion: r.round.motionReleased ? r.round.motion : null,
      flight: r.pairing.flight,
      eventName: r.eventName,
      eventAbbr: r.eventAbbr,
      format: r.format,
      sideLabels: isDebateConfig(cfg) ? cfg.sideLabels : null,
      role: r.role,
      label: r.pairing.label,
      sidesPending: r.pairing.sidesPending,
      room: rooms.find((x) => x.id === r.pairing.roomId) ?? null,
      entries: pes
        .filter((p) => p.pairingId === r.pairing.id)
        .sort((a, b) => (a.side ?? "Z").localeCompare(b.side ?? "Z") || a.position - b.position),
      ballot: bs.find((b) => b.pairingId === r.pairing.id) ?? null,
    };
  });
}

/** Ballots an entry may see (after the tab releases them). */
export async function releasedBallotsForEntry(db: Queryable, entryId: string) {
  const rows = await db
    .select({ ballot, round, judgeName: judge.name })
    .from(pairingEntry)
    .innerJoin(pairing, eq(pairing.id, pairingEntry.pairingId))
    .innerJoin(round, eq(round.id, pairing.roundId))
    .innerJoin(ballot, eq(ballot.pairingId, pairing.id))
    .innerJoin(judge, eq(judge.id, ballot.judgeId))
    .where(
      and(
        eq(pairingEntry.entryId, entryId),
        eq(round.ballotsReleased, true),
        inArray(ballot.status, ["submitted", "confirmed"]),
      ),
    )
    .orderBy(asc(round.seq));
  const scores = rows.length
    ? await db
        .select()
        .from(speakerScore)
        .where(
          inArray(
            speakerScore.ballotId,
            rows.map((r) => r.ballot.id),
          ),
        )
    : [];
  return rows.map((r) => ({
    roundLabel: r.round.label,
    judgeName: r.judgeName,
    won: r.ballot.winnerEntryId === entryId,
    rfd: r.ballot.rfd,
    comment: r.ballot.feedback?.comments?.[entryId] ?? null,
    points: scores
      .filter((s) => s.ballotId === r.ballot.id && s.entryId === entryId)
      .map((s) => ({ position: s.position, points: s.points, reply: s.reply })),
  }));
}
