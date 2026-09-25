import {
  accessToken,
  auditLog,
  ballot,
  entry,
  event,
  judge,
  pairing,
  type Queryable,
  room,
  round,
  school,
} from "@opentab/db";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";

/** Aggregates for the tab-room overview. */
export async function tournamentOverview(db: Queryable, tournamentId: string) {
  const [[entries], [judges], [rooms], [schools], [links]] = await Promise.all([
    db
      .select({ n: count() })
      .from(entry)
      .where(and(eq(entry.tournamentId, tournamentId), eq(entry.status, "active"))),
    db
      .select({ n: count() })
      .from(judge)
      .where(and(eq(judge.tournamentId, tournamentId), eq(judge.active, true))),
    db
      .select({ n: count() })
      .from(room)
      .where(and(eq(room.tournamentId, tournamentId), eq(room.active, true))),
    db.select({ n: count() }).from(school).where(eq(school.tournamentId, tournamentId)),
    db.select({ n: count() }).from(accessToken).where(eq(accessToken.tournamentId, tournamentId)),
  ]);
  const events = await db
    .select()
    .from(event)
    .where(eq(event.tournamentId, tournamentId))
    .orderBy(asc(event.sort));
  const rounds = await db
    .select()
    .from(round)
    .where(eq(round.tournamentId, tournamentId))
    .orderBy(asc(round.seq));
  const entryCounts = await db
    .select({ eventId: entry.eventId, n: count() })
    .from(entry)
    .where(and(eq(entry.tournamentId, tournamentId), eq(entry.status, "active")))
    .groupBy(entry.eventId);

  const latestByEvent = new Map<string, (typeof rounds)[number]>();
  for (const r of rounds) latestByEvent.set(r.eventId, r);
  const latestIds = [...latestByEvent.values()].map((r) => r.id);
  const ballotRows = latestIds.length
    ? await db
        .select({ roundId: pairing.roundId, status: ballot.status })
        .from(ballot)
        .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
        .where(inArray(pairing.roundId, latestIds))
    : [];

  const recent = await db
    .select()
    .from(auditLog)
    .where(eq(auditLog.tournamentId, tournamentId))
    .orderBy(desc(auditLog.createdAt))
    .limit(8);

  return {
    counts: {
      entries: entries!.n,
      judges: judges!.n,
      rooms: rooms!.n,
      schools: schools!.n,
      links: links!.n,
    },
    events: events.map((e) => {
      const r = latestByEvent.get(e.id) ?? null;
      const bs = r ? ballotRows.filter((b) => b.roundId === r.id) : [];
      return {
        id: e.id,
        name: e.name,
        abbreviation: e.abbreviation,
        format: e.format,
        entries: entryCounts.find((c) => c.eventId === e.id)?.n ?? 0,
        rounds: rounds.filter((x) => x.eventId === e.id).length,
        latest: r,
        ballots: {
          total: bs.length,
          in: bs.filter((b) => b.status === "submitted" || b.status === "confirmed").length,
        },
      };
    }),
    recent,
  };
}
