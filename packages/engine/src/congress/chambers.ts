import type { CongressTiebreak } from "../formats/schemas";
import { hashString, Rng } from "../rng";
import { type Criterion, type Ranked, rankItems, sumWithDrop } from "../standings/rank";
import { assertNever, type EntryInfo } from "../types";

/**
 * Congress: chamber assignment and chamber/overall standings.
 */

/** Snake seeds into chambers, then local-search swaps to spread schools. */
export function assignChambers(
  entries: readonly EntryInfo[],
  chamberCount: number,
  seed: string,
): EntryInfo[][] {
  const rng = new Rng(seed);
  const k = Math.max(1, chamberCount);
  const seeded = [...rng.shuffle(entries)].sort(
    (a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER),
  );
  const chambers: EntryInfo[][] = Array.from({ length: k }, () => []);
  seeded.forEach((e, i) => {
    const lap = Math.floor(i / k);
    const idx = lap % 2 === 0 ? i % k : k - 1 - (i % k);
    chambers[idx]!.push(e);
  });

  const chamberCost = (c: EntryInfo[]): number => {
    const bySchool = new Map<string, number>();
    const byRegion = new Map<string, number>();
    for (const e of c) {
      if (e.schoolId) bySchool.set(e.schoolId, (bySchool.get(e.schoolId) ?? 0) + 1);
      if (e.regionId) byRegion.set(e.regionId, (byRegion.get(e.regionId) ?? 0) + 1);
    }
    let cost = 0;
    for (const n of bySchool.values()) cost += ((n * (n - 1)) / 2) * 1000;
    for (const n of byRegion.values()) cost += (n * (n - 1)) / 2;
    return cost;
  };
  const seedOf = (e: EntryInfo) => e.seed ?? 0;
  const avgSeed = (c: EntryInfo[]) =>
    c.length ? c.reduce((a, e) => a + seedOf(e), 0) / c.length : 0;

  // Local search: accept swaps that reduce school clustering without
  // unbalancing seeds much.
  for (let iter = 0; iter < 40; iter++) {
    let improved = false;
    for (let a = 0; a < k; a++) {
      for (let b = a + 1; b < k; b++) {
        const ca = chambers[a]!;
        const cb = chambers[b]!;
        for (let i = 0; i < ca.length; i++) {
          for (let j = 0; j < cb.length; j++) {
            const before = chamberCost(ca) + chamberCost(cb);
            const seedBefore = Math.abs(avgSeed(ca) - avgSeed(cb));
            [ca[i], cb[j]] = [cb[j]!, ca[i]!];
            const after = chamberCost(ca) + chamberCost(cb);
            const seedAfter = Math.abs(avgSeed(ca) - avgSeed(cb));
            if (after < before && seedAfter <= seedBefore + 2) {
              improved = true;
            } else {
              [ca[i], cb[j]] = [cb[j]!, ca[i]!];
            }
          }
        }
      }
    }
    if (!improved) break;
  }
  return chambers;
}

export interface CongressBallotRecord {
  roundSeq: number;
  chamberId: string;
  judgeId: string;
  parliamentarian?: boolean;
  ranks: { entryId: string; rank: number }[];
  speeches: { entryId: string; points: number }[];
  po?: { entryId: string; points: number } | null;
}

export interface CongressStanding {
  entryId: string;
  code: string;
  rankSum: number;
  reciprocals: number;
  speechPoints: number;
  speeches: number;
  poPoints: number;
  parliRanks: number;
  ballots: number;
}

export function computeCongressStandings(
  entries: readonly EntryInfo[],
  ballots: readonly CongressBallotRecord[],
  tiebreaks: readonly CongressTiebreak[],
  opts: {
    ranksPerBallot: number;
    chamberMembers: ReadonlyMap<string, readonly string[]>;
    seed?: string;
  },
): (Ranked<CongressStanding> & { explanation: string })[] {
  const unranked = opts.ranksPerBallot + 1;
  const rows = entries
    .filter((e) => e.active !== false)
    .map((e) => {
      let rankSum = 0;
      let recip = 0;
      let parli = 0;
      let speechPoints = 0;
      let speeches = 0;
      let poPoints = 0;
      let count = 0;
      const rankList: number[] = [];
      for (const b of ballots) {
        const members = opts.chamberMembers.get(`${b.roundSeq}:${b.chamberId}`) ?? [];
        if (!members.includes(e.id)) continue;
        const r = b.ranks.find((x) => x.entryId === e.id)?.rank ?? unranked;
        if (b.parliamentarian) {
          parli += r;
          continue;
        }
        count++;
        rankSum += r;
        rankList.push(r);
        recip += r <= opts.ranksPerBallot ? 1 / r : 0;
        for (const s of b.speeches)
          if (s.entryId === e.id) {
            speechPoints += s.points;
            speeches++;
          }
        if (b.po?.entryId === e.id) poPoints += b.po.points;
      }
      return {
        entryId: e.id,
        code: e.code,
        rankSum,
        rankList,
        reciprocals: Math.round(recip * 1000) / 1000,
        speechPoints,
        speeches,
        poPoints,
        parliRanks: parli,
        ballots: count,
        seed: e.seed ?? null,
      };
    });

  type Row = (typeof rows)[number];
  const coin = opts.seed ?? "congress";
  const labels: Record<CongressTiebreak["key"], string> = {
    rank_sum: "Rank total",
    reciprocals: "Reciprocals",
    judge_preference: "Judge preference",
    parli_ranks: "Parliamentarian ranks",
    speech_points: "Speech points",
    po_points: "PO points",
    seed: "Seed",
    coinflip: "Coin flip",
  };
  const criteria: Criterion<Row>[] = tiebreaks.map((tb, i) => {
    const id = `${tb.key}_${i}`;
    const label = labels[tb.key];
    switch (tb.key) {
      case "rank_sum":
        return { id, label, direction: "asc", value: (r) => sumWithDrop(r.rankList, tb.drop) };
      case "reciprocals":
        return { id, label, direction: "desc", value: (r) => r.reciprocals };
      case "judge_preference":
        return {
          id,
          label,
          compare: (a, b) => {
            let aPref = 0;
            let bPref = 0;
            for (const bal of ballots) {
              if (bal.parliamentarian) continue;
              const members = opts.chamberMembers.get(`${bal.roundSeq}:${bal.chamberId}`) ?? [];
              if (!members.includes(a.entryId) || !members.includes(b.entryId)) continue;
              const ra = bal.ranks.find((x) => x.entryId === a.entryId)?.rank ?? unranked;
              const rb = bal.ranks.find((x) => x.entryId === b.entryId)?.rank ?? unranked;
              if (ra < rb) aPref++;
              else if (rb < ra) bPref++;
            }
            return bPref - aPref;
          },
        };
      case "parli_ranks":
        return { id, label, direction: "asc", value: (r) => r.parliRanks };
      case "speech_points":
        return { id, label, direction: "desc", value: (r) => r.speechPoints };
      case "po_points":
        return { id, label, direction: "desc", value: (r) => r.poPoints };
      case "seed":
        return { id, label, direction: "asc", value: (r) => r.seed };
      case "coinflip":
        return { id, label, direction: "asc", value: (r) => hashString(`${coin}:${r.entryId}`) };
      default:
        return assertNever(tb.key);
    }
  });
  const ranked = rankItems(rows, criteria);
  return ranked.map((r, i) => {
    const prev = ranked[i - 1];
    let explanation = "";
    if (!prev) explanation = "Top of the standings.";
    else if (r.rank === prev.rank) explanation = `Tied with ${prev.item.code}.`;
    else if (r.separatedBy) explanation = `Below ${prev.item.code} on ${r.separatedBy}.`;
    return { ...r, explanation };
  });
}

/** Top N from each chamber (by chamber-local standings) advance. */
export function congressAdvancers(
  chamberStandings: ReadonlyMap<string, readonly { entryId: string }[]>,
  perChamber: number,
): string[] {
  const out: string[] = [];
  for (const rows of chamberStandings.values())
    out.push(...rows.slice(0, perChamber).map((r) => r.entryId));
  return out;
}
