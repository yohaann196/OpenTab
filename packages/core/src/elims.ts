import {
  breakEntry,
  type Db,
  entry,
  pairing,
  publishedSnapshot,
  type Queryable,
  round,
} from "@opentab/db";
import {
  closeoutFindings,
  computeTeamStandings,
  decideDebate,
  type ElimSlot,
  elimRoundName,
  elimSides,
  type Finding,
  isDebateConfig,
  nextElimRound,
  Rng,
  seedFirstElimRound,
} from "@opentab/engine";
import { and, asc, eq, lt } from "drizzle-orm";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { invalid } from "./errors";
import { loadDebateResults, loadEventBundle, loadRoundPairings } from "./loaders";
import { emit } from "./realtime";
import type { SerializedPairing } from "./rounds";

/** Current break (seeded entries advancing to elims). */
export async function getBreak(db: Queryable, eventId: string) {
  return db
    .select({
      entryId: breakEntry.entryId,
      seed: breakEntry.seed,
      code: entry.code,
      name: entry.name,
    })
    .from(breakEntry)
    .innerJoin(entry, eq(entry.id, breakEntry.entryId))
    .where(eq(breakEntry.eventId, eventId))
    .orderBy(asc(breakEntry.seed));
}

/**
 * Sets the break. With no explicit order, the top `size` active entries from
 * the prelim standings break in standings order.
 */
export async function createBreak(
  db: Db,
  actor: Actor,
  eventId: string,
  size: number,
  order?: string[],
) {
  return db.transaction(async (tx) => {
    const bundle = await loadEventBundle(tx, eventId);
    await requireRole(tx, actor, bundle.event.tournamentId, "tabber");
    if (!isDebateConfig(bundle.config)) throw invalid("Use chamber advancement for Congress");
    let ids = order;
    if (!ids) {
      const results = await loadDebateResults(tx, eventId, { stage: "prelim" });
      const st = computeTeamStandings(bundle.entries, results, bundle.config.tiebreaks, {
        byeCountsAsWin: bundle.config.byeCountsAsWin,
        seed: eventId,
      });
      ids = st.rows.map((r) => r.item.entryId).slice(0, size);
    }
    if (ids.length < 2) throw invalid("A break needs at least two entries");
    await tx.delete(breakEntry).where(eq(breakEntry.eventId, eventId));
    await tx
      .insert(breakEntry)
      .values(ids.map((entryId, i) => ({ eventId, entryId, seed: i + 1 })));
    await audit(tx, actor, {
      tournamentId: bundle.event.tournamentId,
      action: "break.set",
      entityType: "event",
      entityId: eventId,
      summary: `Set a ${ids.length}-entry break for ${bundle.event.abbreviation}`,
      after: ids,
    });
    return ids;
  });
}

/** Builds the pairings for an elim round from the break or the previous elim. */
export async function generateElimPairings(
  tx: Queryable,
  r: typeof round.$inferSelect,
  bundle: Awaited<ReturnType<typeof loadEventBundle>>,
  seed: string,
): Promise<{ pairings: SerializedPairing[]; findings: Finding[] }> {
  const findings: Finding[] = [];
  const brk = await getBreak(tx, r.eventId);
  if (brk.length < 2) throw invalid("Set the break before pairing elimination rounds");
  const seedOf = new Map(brk.map((b) => [b.entryId, b.seed]));
  const previous = await tx
    .select()
    .from(round)
    .where(and(eq(round.eventId, r.eventId), eq(round.stage, "elim"), lt(round.seq, r.seq)))
    .orderBy(asc(round.seq));
  const prev = previous.at(-1);

  let matches: ReturnType<typeof seedFirstElimRound>;
  if (!prev) {
    matches = seedFirstElimRound(brk.map((b) => b.entryId));
  } else {
    const prevPairings = await loadRoundPairings(tx, prev.id);
    const results = await loadDebateResults(tx, r.eventId, { stage: "elim" });
    const winners: (ElimSlot & { slot: number })[] = [];
    for (const p of prevPairings) {
      const res = results.find((d) => d.pairingId === p.id);
      const winner = p.bye ? p.entries[0]?.entryId : res ? decideDebate(res) : null;
      if (!winner) {
        findings.push({
          code: "undecided_elim",
          severity: "error",
          message: `${prev.label}: a debate has no decision yet.`,
          hint: "Enter all ballots for the previous elim round first.",
          entryIds: p.entries.map((e) => e.entryId),
        });
        continue;
      }
      winners.push({ entryId: winner, seed: seedOf.get(winner) ?? 999, slot: p.elimSlot ?? 0 });
    }
    if (findings.length) throw invalid("The previous elimination round isn't finished", findings);
    matches = nextElimRound(winners, r.settings?.reseed ?? false);
  }
  if (matches.length === 0) throw invalid("The bracket is complete — there is a champion");

  findings.push(...closeoutFindings(matches, bundle.entries));
  const history = await loadDebateResults(tx, r.eventId, { stage: "all", beforeSeq: r.seq });
  const rng = new Rng(seed);
  const pairings: SerializedPairing[] = matches.map((m) => {
    if (!m.low) {
      return {
        flight: 1,
        bracket: null,
        bye: true,
        roomId: null,
        locked: false,
        sidesPending: false,
        elimSlot: m.slot,
        label: `${m.high.seed} (bye)`,
        forfeitEntryId: null,
        explain: null,
        entries: [{ entryId: m.high.entryId, side: null, position: 0, pulledUp: false }],
        judges: [],
      };
    }
    const sides = elimSides(m.high.entryId, m.low.entryId, history, rng);
    return {
      flight: 1,
      bracket: null,
      bye: false,
      roomId: null,
      locked: false,
      sidesPending: sides.pending,
      elimSlot: m.slot,
      label: `${m.high.seed} v ${m.low.seed}`,
      forfeitEntryId: null,
      explain: [{ term: "elimSides", cost: 0, detail: sides.reason }],
      entries: [
        { entryId: m.high.entryId, side: sides.sides[0], position: 0, pulledUp: false },
        { entryId: m.low.entryId, side: sides.sides[1], position: 1, pulledUp: false },
      ],
      judges: [],
    };
  });
  return { pairings, findings };
}

/** Bracket view model: each elim round with its matches and results. */
export async function buildBracket(db: Queryable, eventId: string) {
  const bundle = await loadEventBundle(db, eventId);
  const brk = await getBreak(db, eventId);
  const seedOf = new Map(brk.map((b) => [b.entryId, b.seed]));
  const codeOf = new Map(bundle.entries.map((e) => [e.id, e.code]));
  const elims = await db
    .select()
    .from(round)
    .where(and(eq(round.eventId, eventId), eq(round.stage, "elim")))
    .orderBy(asc(round.seq));
  const results = await loadDebateResults(db, eventId, { stage: "elim" });
  const rounds = [];
  for (const r of elims) {
    const ps = await loadRoundPairings(db, r.id);
    rounds.push({
      id: r.id,
      label: r.label,
      status: r.status,
      matches: ps
        .sort((a, b) => (a.elimSlot ?? 0) - (b.elimSlot ?? 0))
        .map((p) => {
          const res = results.find((d) => d.pairingId === p.id);
          const winner = p.bye ? (p.entries[0]?.entryId ?? null) : res ? decideDebate(res) : null;
          const decided = res?.ballots.filter((b) => !b.trainee && b.winnerId) ?? [];
          return {
            pairingId: p.id,
            slot: p.elimSlot ?? 0,
            bye: p.bye,
            winnerId: winner,
            entries: p.entries.map((e) => ({
              entryId: e.entryId,
              code: codeOf.get(e.entryId) ?? "?",
              seed: seedOf.get(e.entryId) ?? null,
              side: e.side,
              ballots: decided.filter((b) => b.winnerId === e.entryId).length,
            })),
          };
        }),
    });
  }
  const last = rounds.at(-1);
  const champion =
    last && last.matches.length === 1 && last.matches[0]!.winnerId
      ? (codeOf.get(last.matches[0]!.winnerId) ?? null)
      : null;
  return { eventId, breakSize: brk.length, seeds: brk, rounds, champion };
}

export async function publishBracket(db: Db, actor: Actor, eventId: string) {
  return db.transaction(async (tx) => {
    const bundle = await loadEventBundle(tx, eventId);
    await requireRole(tx, actor, bundle.event.tournamentId, "tabber");
    const data = await buildBracket(tx, eventId);
    await tx
      .insert(publishedSnapshot)
      .values({ tournamentId: bundle.event.tournamentId, kind: "bracket", refId: eventId, data })
      .onConflictDoUpdate({
        target: [publishedSnapshot.kind, publishedSnapshot.refId],
        set: { data, publishedAt: new Date() },
      });
    await emit(tx, bundle.event.tournamentId, { type: "standings.published", eventId });
  });
}

/** Suggested label for the next elim round given the number of entries remaining. */
export async function nextElimLabel(
  db: Queryable,
  eventId: string,
): Promise<{ label: string; remaining: number }> {
  const brk = await getBreak(db, eventId);
  const elims = await db
    .select()
    .from(round)
    .where(and(eq(round.eventId, eventId), eq(round.stage, "elim")));
  let remaining = 1;
  while (remaining < brk.length) remaining *= 2;
  for (let i = 0; i < elims.length; i++) remaining = Math.max(1, remaining / 2);
  return { label: elimRoundName(remaining), remaining };
}

export async function winnersOf(db: Queryable, roundId: string) {
  const ps = await db.select().from(pairing).where(eq(pairing.roundId, roundId));
  return ps.filter((p) => p.winnerEntryId).map((p) => p.winnerEntryId!);
}
