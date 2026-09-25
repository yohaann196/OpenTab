import { auditLog, publishedSnapshot, type Queryable, school } from "@opentab/db";
import { buildRecords, isDebateConfig } from "@opentab/engine";
import { and, desc, eq } from "drizzle-orm";
import {
  loadDebateResults,
  loadEventBundle,
  loadJudgesForRound,
  loadRoomsForRound,
  loadRound,
  loadRoundPairings,
} from "./loaders";
import { checkRoundDraft } from "./rounds";

/** Everything the draw editor needs, in one serialisable object. */
export async function drawEditorData(db: Queryable, roundId: string) {
  const r = await loadRound(db, roundId);
  const bundle = await loadEventBundle(db, r.eventId);
  const [pairings, judgesCtx, roomsCtx, findings, results, schools, history, snap] =
    await Promise.all([
      loadRoundPairings(db, roundId),
      loadJudgesForRound(db, r),
      loadRoomsForRound(db, r),
      checkRoundDraft(db, roundId),
      bundle.config.format === "congress"
        ? Promise.resolve([])
        : loadDebateResults(db, r.eventId, { beforeSeq: r.seq, stage: "all" }),
      db.select().from(school).where(eq(school.tournamentId, r.tournamentId)),
      db
        .select({
          id: auditLog.id,
          summary: auditLog.summary,
          actor: auditLog.actorLabel,
          at: auditLog.createdAt,
          action: auditLog.action,
        })
        .from(auditLog)
        .where(and(eq(auditLog.entityType, "round"), eq(auditLog.entityId, roundId)))
        .orderBy(desc(auditLog.createdAt))
        .limit(30),
      db
        .select({ version: publishedSnapshot.version })
        .from(publishedSnapshot)
        .where(and(eq(publishedSnapshot.kind, "pairings"), eq(publishedSnapshot.refId, roundId))),
    ]);
  const schoolName = new Map(schools.map((s) => [s.id, s.code || s.name]));
  const records = buildRecords(
    bundle.entries,
    results.filter((x) => x.stage === "prelim"),
  );
  const placed = new Set(pairings.flatMap((p) => p.judges.map((j) => j.judgeId)));
  const cfg = bundle.config;
  return {
    round: {
      id: r.id,
      label: r.label,
      seq: r.seq,
      stage: r.stage,
      method: r.method,
      status: r.status,
      version: r.version,
      flights: r.flights,
      panelSize: r.panelSize,
      motion: r.motion,
      motionReleased: r.motionReleased,
      ballotsReleased: r.ballotsReleased,
      scheduledPublishAt: r.scheduledPublishAt?.toISOString() ?? null,
      publishedVersion: snap[0]?.version ?? null,
      timeslotId: r.timeslotId,
    },
    event: {
      id: bundle.event.id,
      name: bundle.event.name,
      abbreviation: bundle.event.abbreviation,
      format: bundle.event.format,
    },
    sideLabels: isDebateConfig(cfg) ? cfg.sideLabels : null,
    debates: pairings.map((p) => ({
      id: p.id,
      flight: p.flight,
      bracket: p.bracket,
      bye: p.bye,
      locked: p.locked,
      sidesPending: p.sidesPending,
      label: p.label,
      roomId: p.roomId,
      forfeitEntryId: p.forfeitEntryId,
      winnerEntryId: p.winnerEntryId,
      explain: p.explain ?? [],
      entries: p.entries.map((e) => ({
        entryId: e.entryId,
        side: e.side,
        pulledUp: e.pulledUp,
        position: e.position,
      })),
      judges: p.judges.map((j) => ({ judgeId: j.judgeId, role: j.role })),
    })),
    entries: Object.fromEntries(
      bundle.entryRows.map((e) => {
        const rec = records.get(e.id);
        return [
          e.id,
          {
            code: e.code,
            name: e.name,
            school: e.schoolId ? (schoolName.get(e.schoolId) ?? null) : null,
            active: e.status === "active",
            accessible: e.requiresAccessible,
            record: rec ? `${rec.wins}–${rec.losses}` : "0–0",
          },
        ];
      }),
    ) as Record<
      string,
      {
        code: string;
        name: string;
        school: string | null;
        active: boolean;
        accessible: boolean;
        record: string;
      }
    >,
    judges: judgesCtx.judges.map((j) => ({
      id: j.id,
      name: j.name,
      school: j.schoolId ? (schoolName.get(j.schoolId) ?? null) : null,
      rating: j.rating ?? 5,
      available: j.available !== false,
      trainee: !!j.trainee,
      owesBallot: !!j.hasOutstandingBallot,
      judged: j.roundsJudged ?? 0,
      owed: j.roundsOwed ?? 0,
      placed: placed.has(j.id),
      busyElsewhere: judgesCtx.busyJudgeIds.has(j.id),
    })),
    rooms: roomsCtx.rooms.map((rm) => ({
      id: rm.id,
      name: rm.name,
      accessible: !!rm.accessible,
      priority: rm.priority ?? 0,
      available: rm.available !== false,
    })),
    findings,
    history: history.map((h) => ({ ...h, at: h.at.toISOString() })),
  };
}
export type DrawEditorData = Awaited<ReturnType<typeof drawEditorData>>;
