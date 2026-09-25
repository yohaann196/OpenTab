import type { SpeakerTiebreak, TeamTiebreak } from "../formats/schemas";
import { buildRecords, type EntryRecord, scoringBallots } from "../pairing/records";
import { hashString } from "../rng";
import { assertNever, type CompetitorInfo, type DebateResult, type EntryInfo } from "../types";
import { type Criterion, dropLabel, type Ranked, rankItems, sumWithDrop } from "./rank";

export interface TeamStanding {
  entryId: string;
  code: string;
  wins: number;
  losses: number;
  ballots: number;
  points: number;
  oppWins: number;
  record: EntryRecord;
}

export interface TeamStandingsResult {
  rows: (Ranked<TeamStanding> & { explanation: string })[];
  columns: { id: string; label: string }[];
}

const TB_LABELS: Record<TeamTiebreak["key"], string> = {
  wins: "Wins",
  losses: "Losses",
  ballots: "Ballots",
  points: "Speaker points",
  opp_wins: "Opponent wins",
  opp_points: "Opponent points",
  point_diff: "Point differential",
  ranks: "Ranks",
  judge_variance: "Judge variance (z)",
  head_to_head: "Head-to-head",
  seed: "Seed",
  coinflip: "Coin flip",
};

const EXTRA_LABELS: Record<string, string> = {
  rank_sum: "Rank total",
  reciprocals: "Reciprocals",
  judge_preference: "Judge preference",
  parli_ranks: "Parliamentarian ranks",
  speech_points: "Speech points",
  po_points: "PO points",
};

export const tiebreakLabel = (t: { key: string; drop?: TeamTiebreak["drop"] }): string =>
  ((TB_LABELS as Record<string, string>)[t.key] ?? EXTRA_LABELS[t.key] ?? t.key) +
  dropLabel(t.drop);

/**
 * Per-judge mean/stdev of team totals, used for z-score normalisation
 * ("judge variance"). A judge who gave everyone 29.5 no longer inflates
 * the teams they happened to see.
 */
function judgeStats(results: readonly DebateResult[]): Map<string, { mean: number; sd: number }> {
  const totals = new Map<string, number[]>();
  for (const d of results) {
    if (d.bye || d.forfeitId) continue;
    for (const b of scoringBallots(d)) {
      const byEntry = new Map<string, number>();
      for (const s of b.scores) byEntry.set(s.entryId, (byEntry.get(s.entryId) ?? 0) + s.points);
      const arr = totals.get(b.judgeId) ?? [];
      arr.push(...byEntry.values());
      totals.set(b.judgeId, arr);
    }
  }
  const out = new Map<string, { mean: number; sd: number }>();
  for (const [j, arr] of totals) {
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
    out.set(j, { mean, sd: Math.sqrt(variance) });
  }
  return out;
}

export interface TeamStandingsOptions {
  byeCountsAsWin?: boolean;
  throughSeq?: number;
  /** Seed for deterministic coin flips. */
  seed?: string;
}

/** Per-round team points with byes/forfeit wins imputed as the entry's average. */
function pointsPerRound(rec: EntryRecord): number[] {
  const real = rec.rounds.filter((r) => r.points !== null).map((r) => r.points!);
  const avg = real.length ? real.reduce((a, b) => a + b, 0) / real.length : 0;
  return rec.rounds
    .filter((r) => r.points !== null || r.won === true)
    .map((r) => (r.points !== null ? r.points : avg));
}

export function computeTeamStandings(
  entries: readonly EntryInfo[],
  results: readonly DebateResult[],
  tiebreaks: readonly TeamTiebreak[],
  opts: TeamStandingsOptions = {},
): TeamStandingsResult {
  const active = entries.filter((e) => e.active !== false);
  const records = buildRecords(active, results, {
    byeCountsAsWin: opts.byeCountsAsWin,
    throughSeq: opts.throughSeq,
  });
  const filtered = results.filter(
    (r) => r.stage === "prelim" && (opts.throughSeq === undefined || r.roundSeq <= opts.throughSeq),
  );
  const jstats = judgeStats(filtered);
  const coinSeed = opts.seed ?? "standings";

  const zScore = (rec: EntryRecord): number => {
    let total = 0;
    for (const d of filtered) {
      if (d.bye || d.forfeitId || !d.sides.some((s) => s.entryId === rec.entry.id)) continue;
      const zs: number[] = [];
      for (const b of scoringBallots(d)) {
        const st = jstats.get(b.judgeId);
        const pts = b.scores
          .filter((s) => s.entryId === rec.entry.id)
          .reduce((a, s) => a + s.points, 0);
        if (!st || st.sd === 0) zs.push(0);
        else zs.push((pts - st.mean) / st.sd);
      }
      if (zs.length) total += zs.reduce((a, b) => a + b, 0) / zs.length;
    }
    return total;
  };

  const rows: TeamStanding[] = active.map((e) => {
    const rec = records.get(e.id)!;
    return {
      entryId: e.id,
      code: e.code,
      wins: rec.wins,
      losses: rec.losses,
      ballots: rec.ballotsWon,
      points: sumWithDrop(pointsPerRound(rec)),
      oppWins: rec.opponents.reduce((acc, o) => acc + (records.get(o)?.wins ?? 0), 0),
      record: rec,
    };
  });
  const byId = new Map(rows.map((r) => [r.entryId, r]));

  const criteria: Criterion<TeamStanding>[] = tiebreaks.map((tb, i) => {
    const id = `${tb.key}${tb.drop ? `_${tb.drop.mode}${tb.drop.count}` : ""}_${i}`;
    const label = tiebreakLabel(tb);
    switch (tb.key) {
      case "wins":
        return { id, label, direction: "desc", value: (r) => r.wins };
      case "losses":
        return { id, label, direction: "asc", value: (r) => r.losses };
      case "ballots":
        return { id, label, direction: "desc", value: (r) => r.ballots };
      case "points":
        return {
          id,
          label,
          direction: "desc",
          value: (r) => round2(sumWithDrop(pointsPerRound(r.record), tb.drop)),
        };
      case "opp_wins":
        return { id, label, direction: "desc", value: (r) => r.oppWins };
      case "opp_points":
        return {
          id,
          label,
          direction: "desc",
          value: (r) =>
            round2(r.record.opponents.reduce((acc, o) => acc + (byId.get(o)?.points ?? 0), 0)),
        };
      case "point_diff":
        return {
          id,
          label,
          direction: "desc",
          value: (r) =>
            round2(
              r.record.rounds.reduce(
                (acc, x) =>
                  acc +
                  (x.points !== null && x.opponentPoints !== null
                    ? x.points - x.opponentPoints
                    : 0),
                0,
              ),
            ),
        };
      case "ranks":
        return {
          id,
          label,
          direction: "asc",
          value: (r) => {
            const rs = r.record.rounds.filter((x) => x.ranks !== null).map((x) => x.ranks!);
            return rs.length ? round2(sumWithDrop(rs, tb.drop)) : null;
          },
        };
      case "judge_variance":
        return { id, label, direction: "desc", value: (r) => round2(zScore(r.record)) };
      case "head_to_head":
        return {
          id,
          label,
          compare: (a, b) => {
            let aw = 0;
            let bw = 0;
            for (const x of a.record.rounds) {
              if (x.opponentId !== b.entryId) continue;
              aw += x.ballotsWon;
              bw += x.ballotsTotal - x.ballotsWon;
            }
            return bw - aw;
          },
        };
      case "seed":
        return { id, label, direction: "asc", value: (r) => r.record.entry.seed ?? null };
      case "coinflip":
        return {
          id,
          label,
          direction: "asc",
          value: (r) => hashString(`${coinSeed}:${r.entryId}`),
        };
      default:
        return assertNever(tb.key);
    }
  });

  const ranked = rankItems(rows, criteria);
  return {
    columns: criteria.map((c) => ({ id: c.id, label: c.label })),
    rows: ranked.map((r, i) => ({
      ...r,
      explanation: explain(r, ranked[i - 1], criteria),
    })),
  };
}

function explain<T extends { code: string }>(
  cur: Ranked<T>,
  prev: Ranked<T> | undefined,
  criteria: readonly Criterion<T>[],
): string {
  if (!prev) return "Top of the standings.";
  if (cur.tied && cur.rank === prev.rank) return `Tied with ${prev.item.code} on every tiebreak.`;
  if (!cur.separatedBy) return "";
  const idx = criteria.findIndex((c) => c.label === cur.separatedBy);
  const a = cur.values[idx];
  const b = prev.values[idx];
  if (a == null || b == null) return `Separated from ${prev.item.code} by ${cur.separatedBy}.`;
  const crit = criteria[idx]!;
  if (crit.id.startsWith("coinflip")) return `Separated from ${prev.item.code} by coin flip.`;
  return `Below ${prev.item.code} on ${cur.separatedBy}: ${fmt(a)} vs ${fmt(b)}.`;
}

const fmt = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(2));
const round2 = (n: number): number => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Speaker standings
// ---------------------------------------------------------------------------

export interface SpeakerStanding {
  competitorId: string;
  entryId: string;
  name: string;
  entryCode: string;
  pointsByRound: number[];
  ranksByRound: number[];
  total: number;
}

export function computeSpeakerStandings(
  competitors: readonly CompetitorInfo[],
  entries: readonly EntryInfo[],
  results: readonly DebateResult[],
  tiebreaks: readonly SpeakerTiebreak[],
  opts: { throughSeq?: number; seed?: string } = {},
): (Ranked<SpeakerStanding> & { explanation: string })[] {
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const filtered = results.filter(
    (r) =>
      r.stage === "prelim" &&
      !r.bye &&
      !r.forfeitId &&
      (opts.throughSeq === undefined || r.roundSeq <= opts.throughSeq),
  );
  const jstats = new Map<string, { mean: number; sd: number }>();
  {
    const all = new Map<string, number[]>();
    for (const d of filtered)
      for (const b of scoringBallots(d))
        for (const s of b.scores) {
          if (s.reply) continue;
          const arr = all.get(b.judgeId) ?? [];
          arr.push(s.points);
          all.set(b.judgeId, arr);
        }
    for (const [j, arr] of all) {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
      jstats.set(j, {
        mean,
        sd: Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length),
      });
    }
  }

  const rows: (SpeakerStanding & { z: number })[] = competitors
    .filter((c) => entryById.get(c.entryId)?.active !== false)
    .map((c) => {
      const pointsByRound: number[] = [];
      const ranksByRound: number[] = [];
      let z = 0;
      for (const d of filtered) {
        const ballots = scoringBallots(d);
        const mine = ballots
          .map((b) => ({ b, s: b.scores.filter((s) => s.competitorId === c.id && !s.reply) }))
          .filter((x) => x.s.length > 0);
        if (mine.length === 0) continue;
        const pts = mine.map((x) => x.s.reduce((a, s) => a + s.points, 0));
        pointsByRound.push(pts.reduce((a, b) => a + b, 0) / pts.length);
        const rk = mine.flatMap((x) => x.s.filter((s) => s.rank != null).map((s) => s.rank!));
        if (rk.length) ranksByRound.push(rk.reduce((a, b) => a + b, 0) / rk.length);
        const zs = mine.map((x) => {
          const st = jstats.get(x.b.judgeId);
          const p = x.s.reduce((a, s) => a + s.points, 0);
          return !st || st.sd === 0 ? 0 : (p - st.mean) / st.sd;
        });
        z += zs.reduce((a, b) => a + b, 0) / zs.length;
      }
      return {
        competitorId: c.id,
        entryId: c.entryId,
        name: c.name,
        entryCode: entryById.get(c.entryId)?.code ?? "",
        pointsByRound,
        ranksByRound,
        total: round2(pointsByRound.reduce((a, b) => a + b, 0)),
        z,
      };
    });

  const coinSeed = opts.seed ?? "speakers";
  const criteria: Criterion<(typeof rows)[number]>[] = tiebreaks.map((tb, i) => {
    const id = `${tb.key}_${i}`;
    const label = tiebreakLabel(tb);
    switch (tb.key) {
      case "points":
        return {
          id,
          label,
          direction: "desc",
          value: (r) => round2(sumWithDrop(r.pointsByRound, tb.drop)),
        };
      case "ranks":
        return {
          id,
          label,
          direction: "asc",
          value: (r) =>
            r.ranksByRound.length ? round2(sumWithDrop(r.ranksByRound, tb.drop)) : null,
        };
      case "judge_variance":
        return { id, label, direction: "desc", value: (r) => round2(r.z) };
      case "coinflip":
        return {
          id,
          label,
          direction: "asc",
          value: (r) => hashString(`${coinSeed}:${r.competitorId}`),
        };
      default:
        return assertNever(tb.key);
    }
  });
  const ranked = rankItems(
    rows.map((r) => ({ ...r, code: r.name })),
    criteria as Criterion<(typeof rows)[number] & { code: string }>[],
  );
  return ranked.map((r, i) => ({
    ...r,
    explanation: explain(
      r,
      ranked[i - 1],
      criteria as Criterion<(typeof rows)[number] & { code: string }>[],
    ),
  }));
}
