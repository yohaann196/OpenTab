import {
  ballot,
  competitor,
  conflict,
  entry,
  event,
  judge,
  judgeBlock,
  judgePoolMember,
  pairing,
  pairingEntry,
  pairingJudge,
  pref,
  prefSheet,
  type Queryable,
  room,
  roomBlock,
  round,
  speakerScore,
  tournament,
} from "@opentab/db";
import {
  type BallotResult,
  type CompetitorInfo,
  type DebateResult,
  type EntryInfo,
  type EventConfig,
  type JudgeInfo,
  type JudgingSettings,
  normalisePrefs,
  type PrefValue,
  type RoomInfo,
  type Side,
} from "@opentab/engine";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { assertFound } from "./errors";

/**
 * Loaders map database rows into the engine's plain data types. This is the
 * only place that knows both worlds.
 */

export async function loadRound(db: Queryable, roundId: string) {
  const [r] = await db.select().from(round).where(eq(round.id, roundId));
  return assertFound(r, "Round");
}

export async function loadEventBundle(db: Queryable, eventId: string) {
  const [ev] = await db.select().from(event).where(eq(event.id, eventId));
  const e = assertFound(ev, "Event");
  const [t] = await db.select().from(tournament).where(eq(tournament.id, e.tournamentId));
  const rows = await db
    .select()
    .from(entry)
    .where(eq(entry.eventId, eventId))
    .orderBy(asc(entry.code));
  const comps = rows.length
    ? await db
        .select()
        .from(competitor)
        .where(
          inArray(
            competitor.entryId,
            rows.map((r) => r.id),
          ),
        )
        .orderBy(asc(competitor.sort))
    : [];
  const entries: EntryInfo[] = rows.map((r) => ({
    id: r.id,
    code: r.code,
    schoolId: r.schoolId,
    seed: r.seed,
    requiresAccessible: r.requiresAccessible,
    active: r.status === "active",
  }));
  const competitors: CompetitorInfo[] = comps.map((c) => ({
    id: c.id,
    entryId: c.entryId,
    name: c.name,
  }));
  return {
    event: e,
    tournament: assertFound(t, "Tournament"),
    config: e.config as EventConfig,
    entryRows: rows,
    entries,
    competitors,
    competitorRows: comps,
  };
}

/**
 * Two-team results for an event from non-draft rounds. Pairings without
 * submitted ballots still contribute opponents and sides (so a published but
 * undecided round already blocks rematches).
 */
export async function loadDebateResults(
  db: Queryable,
  eventId: string,
  opts: { beforeSeq?: number; stage?: "prelim" | "elim" | "all"; excludeRoundId?: string } = {},
): Promise<DebateResult[]> {
  const rounds = await db
    .select()
    .from(round)
    .where(and(eq(round.eventId, eventId), ne(round.status, "draft")))
    .orderBy(asc(round.seq));
  const relevant = rounds.filter(
    (r) =>
      (opts.beforeSeq === undefined || r.seq < opts.beforeSeq) &&
      (opts.stage === undefined || opts.stage === "all" || r.stage === opts.stage) &&
      r.id !== opts.excludeRoundId,
  );
  if (relevant.length === 0) return [];
  const roundById = new Map(relevant.map((r) => [r.id, r]));
  const pairings = await db
    .select()
    .from(pairing)
    .where(
      inArray(
        pairing.roundId,
        relevant.map((r) => r.id),
      ),
    );
  if (pairings.length === 0) return [];
  const pIds = pairings.map((p) => p.id);
  const pes = await db.select().from(pairingEntry).where(inArray(pairingEntry.pairingId, pIds));
  const pjs = await db.select().from(pairingJudge).where(inArray(pairingJudge.pairingId, pIds));
  const ballots = await db
    .select()
    .from(ballot)
    .where(
      and(inArray(ballot.pairingId, pIds), inArray(ballot.status, ["submitted", "confirmed"])),
    );
  const scores = ballots.length
    ? await db
        .select()
        .from(speakerScore)
        .where(
          inArray(
            speakerScore.ballotId,
            ballots.map((b) => b.id),
          ),
        )
    : [];

  const scoresByBallot = new Map<string, typeof scores>();
  for (const s of scores)
    scoresByBallot.set(s.ballotId, [...(scoresByBallot.get(s.ballotId) ?? []), s]);
  const ballotsByPairing = new Map<string, typeof ballots>();
  for (const b of ballots)
    ballotsByPairing.set(b.pairingId, [...(ballotsByPairing.get(b.pairingId) ?? []), b]);
  const entriesByPairing = new Map<string, typeof pes>();
  for (const pe of pes)
    entriesByPairing.set(pe.pairingId, [...(entriesByPairing.get(pe.pairingId) ?? []), pe]);
  const roleOf = new Map(pjs.map((j) => [`${j.pairingId}:${j.judgeId}`, j.role]));

  return pairings.map((p) => {
    const r = roundById.get(p.roundId)!;
    const sides = (entriesByPairing.get(p.id) ?? [])
      .sort((a, b) => (a.side ?? "A").localeCompare(b.side ?? "A") || a.position - b.position)
      .map((pe, i) => ({ entryId: pe.entryId, side: (pe.side ?? (i === 0 ? "A" : "B")) as Side }));
    const ballotResults: BallotResult[] = (ballotsByPairing.get(p.id) ?? []).map((b) => {
      const role = roleOf.get(`${p.id}:${b.judgeId}`);
      return {
        judgeId: b.judgeId,
        winnerId: b.winnerEntryId,
        chair: role === "chair",
        trainee: role === "trainee",
        scores: (scoresByBallot.get(b.id) ?? []).map((s) => ({
          entryId: s.entryId,
          competitorId: s.competitorId,
          position: s.position,
          points: s.points,
          rank: s.rank,
          reply: s.reply,
        })),
      };
    });
    return {
      roundId: r.id,
      roundSeq: r.seq,
      stage: r.stage,
      pairingId: p.id,
      sides,
      bye: p.bye,
      forfeitId: p.forfeitEntryId,
      pulledUpIds: (entriesByPairing.get(p.id) ?? [])
        .filter((pe) => pe.pulledUp)
        .map((pe) => pe.entryId),
      ballots: ballotResults,
    };
  });
}

/** Judges with everything the allocator needs for a specific round. */
export async function loadJudgesForRound(db: Queryable, roundRow: typeof round.$inferSelect) {
  const [ev] = await db.select().from(event).where(eq(event.id, roundRow.eventId));
  const judges = await db
    .select()
    .from(judge)
    .where(eq(judge.tournamentId, roundRow.tournamentId))
    .orderBy(asc(judge.name));
  const judgeIds = judges.map((j) => j.id);
  const conflicts = judgeIds.length
    ? await db.select().from(conflict).where(eq(conflict.tournamentId, roundRow.tournamentId))
    : [];
  const blocks =
    roundRow.timeslotId && judgeIds.length
      ? await db.select().from(judgeBlock).where(eq(judgeBlock.timeslotId, roundRow.timeslotId))
      : [];
  const poolMembers = ev?.judgePoolId
    ? new Set(
        (
          await db.select().from(judgePoolMember).where(eq(judgePoolMember.poolId, ev.judgePoolId))
        ).map((m) => m.judgeId),
      )
    : null;

  // Every judge placement in other non-draft rounds of the tournament.
  const placements = await db
    .select({
      judgeId: pairingJudge.judgeId,
      pairingId: pairingJudge.pairingId,
      roundId: round.id,
      timeslotId: round.timeslotId,
      status: round.status,
      eventId: round.eventId,
    })
    .from(pairingJudge)
    .innerJoin(pairing, eq(pairing.id, pairingJudge.pairingId))
    .innerJoin(round, eq(round.id, pairing.roundId))
    .where(and(eq(round.tournamentId, roundRow.tournamentId), ne(round.id, roundRow.id)));

  const busy = new Set(
    placements
      .filter((p) => roundRow.timeslotId && p.timeslotId === roundRow.timeslotId)
      .map((p) => p.judgeId),
  );
  const judgedCount = new Map<string, number>();
  for (const p of placements)
    if (p.status !== "draft") judgedCount.set(p.judgeId, (judgedCount.get(p.judgeId) ?? 0) + 1);

  // Entries each judge has heard (for repeat avoidance).
  const heardPairings = placements.filter((p) => p.status !== "draft").map((p) => p.pairingId);
  const heardEntries = heardPairings.length
    ? await db
        .select({ pairingId: pairingEntry.pairingId, entryId: pairingEntry.entryId })
        .from(pairingEntry)
        .where(inArray(pairingEntry.pairingId, heardPairings))
    : [];
  const entriesByPairing = new Map<string, string[]>();
  for (const h of heardEntries)
    entriesByPairing.set(h.pairingId, [...(entriesByPairing.get(h.pairingId) ?? []), h.entryId]);
  const history = new Map<string, Set<string>>();
  for (const p of placements) {
    if (p.status === "draft") continue;
    const set = history.get(p.judgeId) ?? new Set<string>();
    for (const e of entriesByPairing.get(p.pairingId) ?? []) set.add(e);
    history.set(p.judgeId, set);
  }

  // Outstanding ballots in other published rounds.
  const owing = judgeIds.length
    ? await db
        .select({ judgeId: ballot.judgeId })
        .from(ballot)
        .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
        .innerJoin(round, eq(round.id, pairing.roundId))
        .where(
          and(
            eq(round.tournamentId, roundRow.tournamentId),
            ne(round.id, roundRow.id),
            eq(round.status, "published"),
            inArray(ballot.status, ["pending", "draft"]),
          ),
        )
    : [];
  const owes = new Set(owing.map((o) => o.judgeId));
  const blocked = new Set(blocks.map((b) => b.judgeId));

  const infos: JudgeInfo[] = judges.map((j) => ({
    id: j.id,
    name: j.name,
    schoolId: j.schoolId,
    conflictEntryIds: conflicts
      .filter((c) => c.judgeId === j.id && c.entryId)
      .map((c) => c.entryId!),
    conflictSchoolIds: conflicts
      .filter((c) => c.judgeId === j.id && c.schoolId)
      .map((c) => c.schoolId!),
    rating: j.rating,
    roundsOwed: j.roundsOwed,
    roundsJudged: judgedCount.get(j.id) ?? 0,
    available:
      j.active &&
      !blocked.has(j.id) &&
      !busy.has(j.id) &&
      (poolMembers === null || poolMembers.has(j.id)),
    hasOutstandingBallot: owes.has(j.id),
    trainee: j.trainee,
  }));
  return { judges: infos, judgeRows: judges, history, busyJudgeIds: busy };
}

export async function loadRoomsForRound(db: Queryable, roundRow: typeof round.$inferSelect) {
  const rooms = await db
    .select()
    .from(room)
    .where(eq(room.tournamentId, roundRow.tournamentId))
    .orderBy(asc(room.name));
  const blocks = roundRow.timeslotId
    ? await db.select().from(roomBlock).where(eq(roomBlock.timeslotId, roundRow.timeslotId))
    : [];
  const used = roundRow.timeslotId
    ? await db
        .select({ roomId: pairing.roomId })
        .from(pairing)
        .innerJoin(round, eq(round.id, pairing.roundId))
        .where(and(eq(round.timeslotId, roundRow.timeslotId), ne(round.id, roundRow.id)))
    : [];
  const busy = new Set(used.map((u) => u.roomId).filter((x): x is string => !!x));
  const blocked = new Set(blocks.map((b) => b.roomId));
  const infos: RoomInfo[] = rooms.map((r) => ({
    id: r.id,
    name: r.name,
    priority: r.priority,
    capacity: r.capacity,
    accessible: r.accessible,
    available: r.active && !blocked.has(r.id) && !busy.has(r.id),
  }));
  return { rooms: infos, roomRows: rooms, busyRoomIds: busy };
}

/** Normalised MPJ prefs for an event, merged with tab/entry strikes. */
export async function loadPrefs(
  db: Queryable,
  eventId: string,
  settings: JudgingSettings,
  roundsOwed: ReadonlyMap<string, number>,
): Promise<Map<string, Map<string, PrefValue>>> {
  const out = new Map<string, Map<string, PrefValue>>();
  const rows = await db
    .select({
      entryId: prefSheet.entryId,
      judgeId: pref.judgeId,
      ordinal: pref.ordinal,
      tier: pref.tier,
      strike: pref.strike,
    })
    .from(pref)
    .innerJoin(prefSheet, eq(prefSheet.id, pref.sheetId))
    .innerJoin(entry, eq(entry.id, prefSheet.entryId))
    .where(eq(entry.eventId, eventId));
  const byEntry = new Map<string, typeof rows>();
  for (const r of rows) byEntry.set(r.entryId, [...(byEntry.get(r.entryId) ?? []), r]);
  for (const [entryId, list] of byEntry)
    out.set(entryId, normalisePrefs(list, settings, roundsOwed));

  const strikes = await db
    .select({ entryId: conflict.entryId, judgeId: conflict.judgeId })
    .from(conflict)
    .innerJoin(entry, eq(entry.id, conflict.entryId))
    .where(and(eq(entry.eventId, eventId), eq(conflict.kind, "strike")));
  for (const s of strikes) {
    if (!s.entryId) continue;
    const m = out.get(s.entryId) ?? new Map<string, PrefValue>();
    m.set(s.judgeId, "strike");
    out.set(s.entryId, m);
  }
  return out;
}

/** Current draft/published pairings of a round with entries, judges, rooms. */
export async function loadRoundPairings(db: Queryable, roundId: string) {
  const ps = await db
    .select()
    .from(pairing)
    .where(eq(pairing.roundId, roundId))
    .orderBy(asc(pairing.flight), asc(pairing.sort));
  if (ps.length === 0) return [];
  const ids = ps.map((p) => p.id);
  const pes = await db.select().from(pairingEntry).where(inArray(pairingEntry.pairingId, ids));
  const pjs = await db.select().from(pairingJudge).where(inArray(pairingJudge.pairingId, ids));
  return ps.map((p) => ({
    ...p,
    entries: pes
      .filter((e) => e.pairingId === p.id)
      .sort((a, b) => (a.side ?? "Z").localeCompare(b.side ?? "Z") || a.position - b.position),
    judges: pjs
      .filter((j) => j.pairingId === p.id)
      .sort((a, b) => roleRank(a.role) - roleRank(b.role)),
  }));
}

const roleRank = (r: string) =>
  ["chair", "parliamentarian", "panelist", "scorer", "trainee"].indexOf(r);

export type LoadedPairing = Awaited<ReturnType<typeof loadRoundPairings>>[number];
