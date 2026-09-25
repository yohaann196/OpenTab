import {
  event,
  judge,
  type Queryable,
  room,
  school,
  type TournamentSettings,
  tournament,
} from "@opentab/db";
import { isDebateConfig } from "@opentab/engine";
import { eq, inArray } from "drizzle-orm";
import { loadEventBundle, loadRound, loadRoundPairings } from "./loaders";

/**
 * Public read models. Published rounds and standings are frozen into JSON
 * snapshots so public pages never run heavy queries — they're cheap to cache
 * at the CDN and survive peak-load Saturdays.
 */

export interface SnapshotEntry {
  id: string;
  code: string;
  name: string | null;
  school: string | null;
  side: "A" | "B" | null;
  competitors: string[];
}

export interface SnapshotDebate {
  id: string;
  flight: number;
  label: string | null;
  bracket: number | null;
  bye: boolean;
  sidesPending: boolean;
  room: { id: string; name: string; building: string | null; onlineUrl: string | null } | null;
  entries: SnapshotEntry[];
  judges: { id: string; name: string; role: string }[];
}

export interface PairingsSnapshot {
  round: {
    id: string;
    label: string;
    seq: number;
    stage: "prelim" | "elim";
    eventId: string;
    eventName: string;
    eventAbbr: string;
    format: string;
    sideLabels: [string, string] | null;
    flights: number;
    motion: string | null;
    startsAt: string | null;
    publishedAt: string;
    version: number;
  };
  debates: SnapshotDebate[];
}

export function privacyFor(settings: TournamentSettings) {
  return { codesOnly: settings.codesOnly ?? false, showJudges: settings.showJudges ?? true };
}

export async function buildPairingsSnapshot(
  db: Queryable,
  roundId: string,
): Promise<PairingsSnapshot> {
  const r = await loadRound(db, roundId);
  const bundle = await loadEventBundle(db, r.eventId);
  const [t] = await db.select().from(tournament).where(eq(tournament.id, r.tournamentId));
  const privacy = privacyFor(t!.settings ?? {});
  const pairings = await loadRoundPairings(db, roundId);
  const roomIds = pairings.map((p) => p.roomId).filter((x): x is string => !!x);
  const rooms = roomIds.length ? await db.select().from(room).where(inArray(room.id, roomIds)) : [];
  const judgeIds = pairings.flatMap((p) => p.judges.map((j) => j.judgeId));
  const judges = judgeIds.length
    ? await db.select().from(judge).where(inArray(judge.id, judgeIds))
    : [];
  const schools = await db.select().from(school).where(eq(school.tournamentId, r.tournamentId));
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));
  const entryById = new Map(bundle.entryRows.map((e) => [e.id, e]));
  const compsByEntry = new Map<string, typeof bundle.competitorRows>();
  for (const c of bundle.competitorRows)
    compsByEntry.set(c.entryId, [...(compsByEntry.get(c.entryId) ?? []), c]);
  const [ev] = await db.select().from(event).where(eq(event.id, r.eventId));

  return {
    round: {
      id: r.id,
      label: r.label,
      seq: r.seq,
      stage: r.stage,
      eventId: r.eventId,
      eventName: ev!.name,
      eventAbbr: ev!.abbreviation,
      format: ev!.format,
      sideLabels: isDebateConfig(bundle.config) ? bundle.config.sideLabels : null,
      flights: r.flights,
      motion: r.motionReleased ? r.motion : null,
      startsAt: r.startsAt?.toISOString() ?? null,
      publishedAt: new Date().toISOString(),
      version: r.version,
    },
    debates: pairings.map((p) => {
      const rm = rooms.find((x) => x.id === p.roomId);
      return {
        id: p.id,
        flight: p.flight,
        label: p.label,
        bracket: p.bracket,
        bye: p.bye,
        sidesPending: p.sidesPending,
        room: rm
          ? { id: rm.id, name: rm.name, building: rm.building, onlineUrl: rm.onlineUrl }
          : null,
        entries: p.entries.map((pe) => {
          const e = entryById.get(pe.entryId);
          return {
            id: pe.entryId,
            code: e?.code ?? "?",
            name: privacy.codesOnly ? null : (e?.name ?? null),
            school: e?.schoolId ? (schoolName.get(e.schoolId) ?? null) : null,
            side: pe.side,
            competitors: privacy.codesOnly
              ? []
              : (compsByEntry.get(pe.entryId) ?? [])
                  .filter((c) => !c.hidePublic)
                  .map((c) => c.name),
          };
        }),
        judges: privacy.showJudges
          ? p.judges
              .filter((j) => j.role !== "trainee")
              .map((j) => ({
                id: j.judgeId,
                name: judges.find((x) => x.id === j.judgeId)?.name ?? "Judge",
                role: j.role,
              }))
          : [],
      };
    }),
  };
}
