import { type Db, publishedSnapshot, type Queryable, round, school } from "@opentab/db";
import {
  type CongressConfig,
  computeSpeakerStandings,
  computeTeamStandings,
  isDebateConfig,
} from "@opentab/engine";
import { and, asc, eq, ne } from "drizzle-orm";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { congressStandings } from "./congress";
import { loadDebateResults, loadEventBundle } from "./loaders";
import { emit } from "./realtime";
import { privacyFor } from "./snapshots";

/** Display-ready standings for an event (two-team or Congress). */
export interface StandingsView {
  eventId: string;
  format: string;
  kind: "team" | "congress";
  throughRound: string | null;
  columns: { id: string; label: string }[];
  rows: {
    rank: number;
    entryId: string;
    code: string;
    name: string | null;
    school: string | null;
    record: string;
    values: (number | null)[];
    explanation: string;
    tied: boolean;
  }[];
  speakers: {
    rank: number;
    competitorId: string;
    name: string;
    entryCode: string;
    total: number;
    values: (number | null)[];
    explanation: string;
  }[];
  speakerColumns: { id: string; label: string }[];
}

export async function computeStandings(
  db: Queryable,
  eventId: string,
  opts: { publicView?: boolean } = {},
): Promise<StandingsView> {
  const bundle = await loadEventBundle(db, eventId);
  const schools = await db
    .select()
    .from(school)
    .where(eq(school.tournamentId, bundle.event.tournamentId));
  const schoolName = new Map(schools.map((s) => [s.id, s.name]));
  const privacy = privacyFor(bundle.tournament.settings ?? {});
  const hideNames = opts.publicView && privacy.codesOnly;
  const rowById = new Map(bundle.entryRows.map((e) => [e.id, e]));
  const prelimRounds = await db
    .select()
    .from(round)
    .where(and(eq(round.eventId, eventId), eq(round.stage, "prelim"), ne(round.status, "draft")))
    .orderBy(asc(round.seq));
  const through = prelimRounds.at(-1)?.label ?? null;

  if (!isDebateConfig(bundle.config)) {
    const rows = await congressStandings(db, eventId, "prelim");
    const cfg = bundle.config as CongressConfig;
    return {
      eventId,
      format: bundle.config.format,
      kind: "congress",
      throughRound: through,
      columns: [
        { id: "rankSum", label: "Rank total" },
        { id: "reciprocals", label: "Reciprocals" },
        { id: "speechPoints", label: "Speech points" },
        { id: "poPoints", label: "PO points" },
      ],
      rows: rows.map((r) => ({
        rank: r.rank,
        entryId: r.item.entryId,
        code: r.item.code,
        name: hideNames ? null : (rowById.get(r.item.entryId)?.name ?? null),
        school: schoolName.get(rowById.get(r.item.entryId)?.schoolId ?? "") ?? null,
        record: `${r.item.speeches} speech${r.item.speeches === 1 ? "" : "es"}`,
        values: [
          r.item.rankSum,
          r.item.reciprocals,
          r.item.speechPoints,
          cfg.presidingOfficer.enabled ? r.item.poPoints : null,
        ],
        explanation: r.explanation,
        tied: r.tied,
      })),
      speakers: [],
      speakerColumns: [],
    };
  }

  const cfg = bundle.config;
  const results = await loadDebateResults(db, eventId, { stage: "prelim" });
  const team = computeTeamStandings(bundle.entries, results, cfg.tiebreaks, {
    byeCountsAsWin: cfg.byeCountsAsWin,
    seed: eventId,
  });
  const speakers = computeSpeakerStandings(
    bundle.competitors.filter(
      (c) => !(opts.publicView && bundle.competitorRows.find((x) => x.id === c.id)?.hidePublic),
    ),
    bundle.entries,
    results,
    cfg.speakerTiebreaks,
    { seed: eventId },
  );
  return {
    eventId,
    format: cfg.format,
    kind: "team",
    throughRound: through,
    columns: team.columns,
    rows: team.rows.map((r) => ({
      rank: r.rank,
      entryId: r.item.entryId,
      code: r.item.code,
      name: hideNames ? null : (rowById.get(r.item.entryId)?.name ?? null),
      school: schoolName.get(rowById.get(r.item.entryId)?.schoolId ?? "") ?? null,
      record: `${r.item.wins}–${r.item.losses}`,
      values: r.values,
      explanation: r.explanation,
      tied: r.tied,
    })),
    speakers: hideNames
      ? []
      : speakers.map((s) => ({
          rank: s.rank,
          competitorId: s.item.competitorId,
          name: s.item.name,
          entryCode: s.item.entryCode,
          total: s.item.total,
          values: s.values,
          explanation: s.explanation,
        })),
    speakerColumns: cfg.speakerTiebreaks.map((t, i) => ({ id: `${t.key}_${i}`, label: t.key })),
  };
}

export async function publishStandings(db: Db, actor: Actor, eventId: string) {
  return db.transaction(async (tx) => {
    const bundle = await loadEventBundle(tx, eventId);
    await requireRole(tx, actor, bundle.event.tournamentId, "tabber");
    const view = await computeStandings(tx, eventId, { publicView: true });
    await tx
      .insert(publishedSnapshot)
      .values({
        tournamentId: bundle.event.tournamentId,
        kind: "standings",
        refId: eventId,
        data: view,
      })
      .onConflictDoUpdate({
        target: [publishedSnapshot.kind, publishedSnapshot.refId],
        set: { data: view, publishedAt: new Date() },
      });
    await audit(tx, actor, {
      tournamentId: bundle.event.tournamentId,
      action: "standings.publish",
      entityType: "event",
      entityId: eventId,
      summary: `Published ${bundle.event.abbreviation} standings`,
    });
    await emit(tx, bundle.event.tournamentId, { type: "standings.published", eventId });
  });
}

export async function unpublishStandings(db: Db, actor: Actor, eventId: string) {
  const bundle = await loadEventBundle(db, eventId);
  await requireRole(db, actor, bundle.event.tournamentId, "tabber");
  await db
    .delete(publishedSnapshot)
    .where(and(eq(publishedSnapshot.kind, "standings"), eq(publishedSnapshot.refId, eventId)));
}

/** Round-by-round record of one entry (for the entry portal and public entry page). */
export async function entryRecord(db: Queryable, eventId: string, entryId: string) {
  const bundle = await loadEventBundle(db, eventId);
  const results = await loadDebateResults(db, eventId, { stage: "all" });
  const codeOf = new Map(bundle.entries.map((e) => [e.id, e.code]));
  return results
    .filter((d) => d.sides.some((s) => s.entryId === entryId))
    .sort((a, b) => a.roundSeq - b.roundSeq)
    .map((d) => {
      const me = d.sides.find((s) => s.entryId === entryId)!;
      const opp = d.sides.find((s) => s.entryId !== entryId);
      const decided = d.ballots.filter((b) => !b.trainee && b.winnerId);
      const won = decided.filter((b) => b.winnerId === entryId).length;
      return {
        roundId: d.roundId,
        pairingId: d.pairingId,
        seq: d.roundSeq,
        stage: d.stage,
        side: d.bye ? null : me.side,
        opponent: opp ? (codeOf.get(opp.entryId) ?? "?") : null,
        bye: !!d.bye,
        ballots: decided.length ? `${won}–${decided.length - won}` : null,
        result: d.bye
          ? "Bye"
          : decided.length === 0
            ? "Pending"
            : won * 2 > decided.length
              ? "W"
              : won * 2 < decided.length
                ? "L"
                : "Split",
      };
    });
}
