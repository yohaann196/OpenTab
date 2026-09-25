import {
  ballot,
  competitor,
  conflict,
  entry,
  event,
  judge,
  pairing,
  pairingEntry,
  pairingJudge,
  type Queryable,
  room,
  round,
  school,
  speakerScore,
  timeslot,
  tournament,
} from "@opentab/db";
import { eq, inArray } from "drizzle-orm";
import Papa from "papaparse";
import type { StandingsView } from "./results";

/** CSV of a standings view. */
export function standingsCsv(view: StandingsView): string {
  return Papa.unparse({
    fields: [
      "Rank",
      "Code",
      "Name",
      "School",
      "Record",
      ...view.columns.map((c) => c.label),
      "Explanation",
    ],
    data: view.rows.map((r) => [
      r.rank,
      r.code,
      r.name ?? "",
      r.school ?? "",
      r.record,
      ...r.values.map((v) => v ?? ""),
      r.explanation,
    ]),
  });
}

export function speakersCsv(view: StandingsView): string {
  return Papa.unparse({
    fields: ["Rank", "Speaker", "Entry", "Total"],
    data: view.speakers.map((s) => [s.rank, s.name, s.entryCode, s.total]),
  });
}

export async function entriesCsv(db: Queryable, tournamentId: string): Promise<string> {
  const rows = await db
    .select({ entry, eventAbbr: event.abbreviation, schoolName: school.name })
    .from(entry)
    .innerJoin(event, eq(event.id, entry.eventId))
    .leftJoin(school, eq(school.id, entry.schoolId))
    .where(eq(entry.tournamentId, tournamentId));
  const comps = rows.length
    ? await db
        .select()
        .from(competitor)
        .where(
          inArray(
            competitor.entryId,
            rows.map((r) => r.entry.id),
          ),
        )
    : [];
  return Papa.unparse({
    fields: ["Event", "Code", "Name", "School", "Status", "Seed", "Competitors"],
    data: rows.map((r) => [
      r.eventAbbr,
      r.entry.code,
      r.entry.name,
      r.schoolName ?? "",
      r.entry.status,
      r.entry.seed ?? "",
      comps
        .filter((c) => c.entryId === r.entry.id)
        .map((c) => c.name)
        .join("; "),
    ]),
  });
}

export async function judgesCsv(db: Queryable, tournamentId: string): Promise<string> {
  const rows = await db
    .select({ judge, schoolName: school.name })
    .from(judge)
    .leftJoin(school, eq(school.id, judge.schoolId))
    .where(eq(judge.tournamentId, tournamentId));
  return Papa.unparse({
    fields: ["Name", "Email", "School", "Rounds owed", "Rating", "Active"],
    data: rows.map((r) => [
      r.judge.name,
      r.judge.email ?? "",
      r.schoolName ?? "",
      r.judge.roundsOwed,
      r.judge.rating,
      r.judge.active ? "yes" : "no",
    ]),
  });
}

/** Complete tournament export (tab staff only) — the data belongs to the tournament. */
export async function fullExport(db: Queryable, tournamentId: string) {
  const [t] = await db.select().from(tournament).where(eq(tournament.id, tournamentId));
  const events = await db.select().from(event).where(eq(event.tournamentId, tournamentId));
  const schools = await db.select().from(school).where(eq(school.tournamentId, tournamentId));
  const entries = await db.select().from(entry).where(eq(entry.tournamentId, tournamentId));
  const comps = entries.length
    ? await db
        .select()
        .from(competitor)
        .where(
          inArray(
            competitor.entryId,
            entries.map((e) => e.id),
          ),
        )
    : [];
  const judges = await db.select().from(judge).where(eq(judge.tournamentId, tournamentId));
  const rooms = await db.select().from(room).where(eq(room.tournamentId, tournamentId));
  const timeslots = await db.select().from(timeslot).where(eq(timeslot.tournamentId, tournamentId));
  const conflicts = await db.select().from(conflict).where(eq(conflict.tournamentId, tournamentId));
  const rounds = await db.select().from(round).where(eq(round.tournamentId, tournamentId));
  const pairings = rounds.length
    ? await db
        .select()
        .from(pairing)
        .where(
          inArray(
            pairing.roundId,
            rounds.map((r) => r.id),
          ),
        )
    : [];
  const pIds = pairings.map((p) => p.id);
  const pairingEntries = pIds.length
    ? await db.select().from(pairingEntry).where(inArray(pairingEntry.pairingId, pIds))
    : [];
  const pairingJudges = pIds.length
    ? await db.select().from(pairingJudge).where(inArray(pairingJudge.pairingId, pIds))
    : [];
  const ballots = pIds.length
    ? await db.select().from(ballot).where(inArray(ballot.pairingId, pIds))
    : [];
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
  return {
    exportedAt: new Date().toISOString(),
    format: "opentab-export@1",
    tournament: t,
    events,
    schools,
    entries,
    competitors: comps,
    judges: judges.map(({ userId: _u, ...j }) => j),
    rooms,
    timeslots,
    conflicts,
    rounds,
    pairings,
    pairingEntries,
    pairingJudges,
    ballots,
    speakerScores: scores,
  };
}
