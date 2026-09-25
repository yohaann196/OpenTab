import type { BallotResult, DebateResult, EntryInfo, Side } from "../types";

/** Outcome of one debate for one entry, derived from its ballots. */
export interface EntryRoundOutcome {
  roundId: string;
  roundSeq: number;
  stage: "prelim" | "elim";
  pairingId: string;
  side: Side | null;
  opponentId: string | null;
  bye: boolean;
  forfeit: boolean;
  won: boolean | null;
  ballotsWon: number;
  ballotsTotal: number;
  /** Team speaker-point total, averaged across scoring ballots. null if none. */
  points: number | null;
  /** Opponent's averaged team total (for point differential). */
  opponentPoints: number | null;
  /** Summed speaker ranks averaged across ballots (lower is better). */
  ranks: number | null;
  pulledUp: boolean;
}

export interface EntryRecord {
  entry: EntryInfo;
  rounds: EntryRoundOutcome[];
  wins: number;
  losses: number;
  ballotsWon: number;
  ballotsTotal: number;
  byes: number;
  pullups: number;
  sideCounts: Record<Side, number>;
  /** Side in the most recent debated round (ignores byes). */
  lastSide: Side | null;
  opponents: string[];
  judgesSeen: Set<string>;
}

/** Scoring (non-trainee) ballots of a debate. */
export const scoringBallots = (d: DebateResult): BallotResult[] =>
  d.ballots.filter((b) => !b.trainee);

/** Decides a debate from its ballots. Returns winner id, or null if undecided. */
export function decideDebate(d: DebateResult, chairBreaksTies = true): string | null {
  if (d.bye) return d.sides[0]?.entryId ?? null;
  if (d.forfeitId) return d.sides.find((s) => s.entryId !== d.forfeitId)?.entryId ?? null;
  const ballots = scoringBallots(d);
  if (ballots.length === 0) return null;
  const tally = new Map<string, number>();
  for (const b of ballots) if (b.winnerId) tally.set(b.winnerId, (tally.get(b.winnerId) ?? 0) + 1);
  const sorted = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;
  if (sorted.length > 1 && sorted[0]![1] === sorted[1]![1]) {
    if (!chairBreaksTies) return null;
    const chair = ballots.find((b) => b.chair);
    return chair?.winnerId ?? null;
  }
  return sorted[0]![0];
}

function teamPoints(ballots: BallotResult[], entryId: string): number | null {
  const totals: number[] = [];
  for (const b of ballots) {
    const s = b.scores.filter((x) => x.entryId === entryId);
    if (s.length === 0) continue;
    totals.push(s.reduce((acc, x) => acc + x.points, 0));
  }
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

function teamRanks(ballots: BallotResult[], entryId: string): number | null {
  const totals: number[] = [];
  for (const b of ballots) {
    const s = b.scores.filter((x) => x.entryId === entryId && x.rank != null);
    if (s.length === 0) continue;
    totals.push(s.reduce((acc, x) => acc + (x.rank ?? 0), 0));
  }
  if (totals.length === 0) return null;
  return totals.reduce((a, b) => a + b, 0) / totals.length;
}

export interface RecordOptions {
  byeCountsAsWin?: boolean;
  /** Only include results up to and including this round sequence. */
  throughSeq?: number;
  stage?: "prelim" | "elim" | "all";
}

/** Builds per-entry records from debate results. */
export function buildRecords(
  entries: readonly EntryInfo[],
  results: readonly DebateResult[],
  opts: RecordOptions = {},
): Map<string, EntryRecord> {
  const byeWin = opts.byeCountsAsWin ?? true;
  const stage = opts.stage ?? "prelim";
  const records = new Map<string, EntryRecord>();
  for (const entry of entries) {
    records.set(entry.id, {
      entry,
      rounds: [],
      wins: 0,
      losses: 0,
      ballotsWon: 0,
      ballotsTotal: 0,
      byes: 0,
      pullups: 0,
      sideCounts: { A: 0, B: 0 },
      lastSide: null,
      opponents: [],
      judgesSeen: new Set(),
    });
  }

  const ordered = [...results]
    .filter((r) => (stage === "all" ? true : r.stage === stage))
    .filter((r) => opts.throughSeq === undefined || r.roundSeq <= opts.throughSeq)
    .sort((a, b) => a.roundSeq - b.roundSeq);

  for (const d of ordered) {
    const winner = decideDebate(d);
    const ballots = scoringBallots(d);
    for (const slot of d.sides) {
      const rec = records.get(slot.entryId);
      if (!rec) continue;
      const opp = d.sides.find((s) => s.entryId !== slot.entryId) ?? null;
      const bye = !!d.bye;
      const forfeit = d.forfeitId === slot.entryId;
      let won: boolean | null = winner === null ? null : winner === slot.entryId;
      if (bye) won = byeWin ? true : null;
      const ballotsWon = bye
        ? byeWin
          ? Math.max(1, ballots.length)
          : 0
        : d.forfeitId
          ? forfeit
            ? 0
            : Math.max(1, ballots.length)
          : ballots.filter((b) => b.winnerId === slot.entryId).length;
      const ballotsTotal = bye || d.forfeitId ? Math.max(1, ballots.length) : ballots.length;
      const outcome: EntryRoundOutcome = {
        roundId: d.roundId,
        roundSeq: d.roundSeq,
        stage: d.stage,
        pairingId: d.pairingId,
        side: bye ? null : slot.side,
        opponentId: opp?.entryId ?? null,
        bye,
        forfeit,
        won,
        ballotsWon,
        ballotsTotal,
        points: bye || d.forfeitId ? null : teamPoints(ballots, slot.entryId),
        opponentPoints: bye || !opp || d.forfeitId ? null : teamPoints(ballots, opp.entryId),
        ranks: bye || d.forfeitId ? null : teamRanks(ballots, slot.entryId),
        pulledUp: d.pulledUpIds?.includes(slot.entryId) ?? false,
      };
      rec.rounds.push(outcome);
      if (won === true) rec.wins++;
      else if (won === false) rec.losses++;
      rec.ballotsWon += ballotsWon;
      rec.ballotsTotal += ballotsTotal;
      if (bye) rec.byes++;
      if (outcome.pulledUp) rec.pullups++;
      if (!bye) {
        rec.sideCounts[slot.side]++;
        rec.lastSide = slot.side;
      }
      if (opp) rec.opponents.push(opp.entryId);
      for (const b of d.ballots) rec.judgesSeen.add(b.judgeId);
    }
  }
  return records;
}
