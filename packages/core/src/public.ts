import {
  event,
  judge,
  publishedSnapshot,
  type Queryable,
  round,
  school,
  tournament,
} from "@opentab/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { StandingsView } from "./results";
import type { PairingsSnapshot } from "./snapshots";

/**
 * Public read side: everything here reads published snapshots or plain
 * public fields, never drafts.
 */

export async function publicTournament(db: Queryable, slug: string) {
  const [t] = await db.select().from(tournament).where(eq(tournament.slug, slug));
  if (!t || t.visibility === "private") return null;
  const events = await db
    .select({
      id: event.id,
      name: event.name,
      abbreviation: event.abbreviation,
      format: event.format,
    })
    .from(event)
    .where(eq(event.tournamentId, t.id))
    .orderBy(asc(event.sort));
  return { tournament: t, events };
}

export async function publishedRounds(db: Queryable, tournamentId: string) {
  const snaps = await db
    .select({
      refId: publishedSnapshot.refId,
      publishedAt: publishedSnapshot.publishedAt,
      version: publishedSnapshot.version,
    })
    .from(publishedSnapshot)
    .where(
      and(eq(publishedSnapshot.tournamentId, tournamentId), eq(publishedSnapshot.kind, "pairings")),
    );
  if (!snaps.length) return [];
  const rounds = await db
    .select({
      id: round.id,
      label: round.label,
      seq: round.seq,
      stage: round.stage,
      eventId: round.eventId,
      status: round.status,
      startsAt: round.startsAt,
    })
    .from(round)
    .where(
      inArray(
        round.id,
        snaps.map((s) => s.refId),
      ),
    )
    .orderBy(desc(round.publishedAt));
  return rounds.map((r) => ({
    ...r,
    publishedAt: snaps.find((s) => s.refId === r.id)!.publishedAt,
  }));
}

export async function pairingsSnapshot(
  db: Queryable,
  roundId: string,
): Promise<(PairingsSnapshot & { publishedAt: Date }) | null> {
  const [row] = await db
    .select()
    .from(publishedSnapshot)
    .where(and(eq(publishedSnapshot.kind, "pairings"), eq(publishedSnapshot.refId, roundId)));
  return row ? { ...(row.data as PairingsSnapshot), publishedAt: row.publishedAt } : null;
}

/** Latest published pairings for every event (the "current round" view). */
export async function currentPairings(db: Queryable, tournamentId: string) {
  const rows = await db
    .select()
    .from(publishedSnapshot)
    .where(
      and(eq(publishedSnapshot.tournamentId, tournamentId), eq(publishedSnapshot.kind, "pairings")),
    )
    .orderBy(desc(publishedSnapshot.publishedAt));
  const latestByEvent = new Map<string, PairingsSnapshot>();
  for (const r of rows) {
    const snap = r.data as PairingsSnapshot;
    const prev = latestByEvent.get(snap.round.eventId);
    if (!prev || prev.round.seq < snap.round.seq) latestByEvent.set(snap.round.eventId, snap);
  }
  return [...latestByEvent.values()];
}

export async function publishedStandings(
  db: Queryable,
  eventId: string,
): Promise<StandingsView | null> {
  const [row] = await db
    .select()
    .from(publishedSnapshot)
    .where(and(eq(publishedSnapshot.kind, "standings"), eq(publishedSnapshot.refId, eventId)));
  return (row?.data as StandingsView) ?? null;
}

export async function publishedBracket(db: Queryable, eventId: string) {
  const [row] = await db
    .select()
    .from(publishedSnapshot)
    .where(and(eq(publishedSnapshot.kind, "bracket"), eq(publishedSnapshot.refId, eventId)));
  return (row?.data as Awaited<ReturnType<typeof import("./elims").buildBracket>>) ?? null;
}

/** "Find me": search published pairings by entry code, competitor, school or judge name. */
export async function findInPairings(db: Queryable, tournamentId: string, q: string) {
  const needle = q.trim().toLowerCase();
  if (needle.length < 2) return [];
  const snaps = await currentPairings(db, tournamentId);
  const hits: {
    snapshot: PairingsSnapshot["round"];
    debate: PairingsSnapshot["debates"][number];
    matched: string;
  }[] = [];
  for (const s of snaps) {
    for (const d of s.debates) {
      const names = [
        ...d.entries.flatMap((e) => [e.code, e.name ?? "", e.school ?? "", ...e.competitors]),
        ...d.judges.map((j) => j.name),
      ];
      const m = names.find((n) => n.toLowerCase().includes(needle));
      if (m) hits.push({ snapshot: s.round, debate: d, matched: m });
    }
  }
  return hits.slice(0, 20);
}

export async function publicJudges(db: Queryable, tournamentId: string) {
  return db
    .select({ id: judge.id, name: judge.name, paradigm: judge.paradigm, school: school.name })
    .from(judge)
    .leftJoin(school, eq(school.id, judge.schoolId))
    .where(and(eq(judge.tournamentId, tournamentId), eq(judge.active, true)))
    .orderBy(asc(judge.name));
}
