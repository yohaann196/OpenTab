/**
 * Generic tiebreak ranker.
 *
 * Items are refined group-by-group: each tiebreak only splits items that are
 * still tied on every earlier tiebreak. Pairwise tiebreaks (head-to-head,
 * judge preference) apply only to groups of exactly two — matching standard
 * practice and avoiding intransitive three-way cycles.
 */

export interface ValueCriterion<T> {
  id: string;
  label: string;
  direction: "asc" | "desc";
  value: (item: T) => number | null;
}

export interface PairwiseCriterion<T> {
  id: string;
  label: string;
  /** Negative if a ranks above b, positive if b ranks above a, 0 if undecided. */
  compare: (a: T, b: T) => number;
}

export type Criterion<T> = ValueCriterion<T> | PairwiseCriterion<T>;

export interface Ranked<T> {
  item: T;
  /** 1-based rank; items tied on every criterion share a rank. */
  rank: number;
  /** Values of each value-criterion, in criterion order (null for pairwise). */
  values: (number | null)[];
  /** Criterion that placed this item below the previous one (null if tied or first). */
  separatedBy: string | null;
  tied: boolean;
}

const EPS = 1e-9;

export function rankItems<T>(items: readonly T[], criteria: readonly Criterion<T>[]): Ranked<T>[] {
  const valueCache = new Map<T, (number | null)[]>();
  for (const it of items) {
    valueCache.set(
      it,
      criteria.map((c) => ("value" in c ? c.value(it) : null)),
    );
  }

  // separatedBy[i] for the flattened order is recorded at the boundary where a split happens.
  interface Group {
    members: T[];
    /** Label that separated this group's first member from the previous group. */
    boundaryLabel: string | null;
  }

  let groups: Group[] = [{ members: [...items], boundaryLabel: null }];

  criteria.forEach((crit, ci) => {
    const next: Group[] = [];
    for (const g of groups) {
      if (g.members.length < 2) {
        next.push(g);
        continue;
      }
      if ("compare" in crit) {
        if (g.members.length !== 2) {
          next.push(g);
          continue;
        }
        const [a, b] = g.members as [T, T];
        const c = crit.compare(a, b);
        if (c === 0) next.push(g);
        else {
          const [first, second] = c < 0 ? [a, b] : [b, a];
          next.push({ members: [first], boundaryLabel: g.boundaryLabel });
          next.push({ members: [second], boundaryLabel: crit.label });
        }
        continue;
      }
      const dir = crit.direction === "desc" ? -1 : 1;
      const keyed = g.members.map((m) => ({ m, v: valueCache.get(m)![ci] ?? null }));
      // Nulls always sort last.
      keyed.sort((x, y) => {
        if (x.v === null && y.v === null) return 0;
        if (x.v === null) return 1;
        if (y.v === null) return -1;
        return dir * (x.v - y.v);
      });
      let current: Group = { members: [], boundaryLabel: g.boundaryLabel };
      let prev: number | null | undefined;
      for (const { m, v } of keyed) {
        const same =
          prev !== undefined &&
          (v === prev || (v !== null && prev !== null && Math.abs(v - prev) < EPS));
        if (prev !== undefined && !same) {
          next.push(current);
          current = { members: [], boundaryLabel: crit.label };
        }
        current.members.push(m);
        prev = v;
      }
      next.push(current);
    }
    groups = next;
  });

  const out: Ranked<T>[] = [];
  let position = 0;
  for (const g of groups) {
    const rank = position + 1;
    g.members.forEach((m, idx) => {
      out.push({
        item: m,
        rank,
        values: valueCache.get(m)!,
        separatedBy: idx === 0 ? g.boundaryLabel : null,
        tied: g.members.length > 1,
      });
    });
    position += g.members.length;
  }
  return out;
}

/** Applies a high/low drop to a list of numbers and returns the sum. */
export function sumWithDrop(
  values: readonly number[],
  drop?: { mode: "high" | "low" | "highlow"; count: number },
): number {
  if (!drop) return values.reduce((a, b) => a + b, 0);
  const sorted = [...values].sort((a, b) => a - b);
  let lo = 0;
  let hi = sorted.length;
  if (drop.mode === "low" || drop.mode === "highlow") lo = Math.min(drop.count, sorted.length);
  if (drop.mode === "high" || drop.mode === "highlow")
    hi = Math.max(lo, sorted.length - drop.count);
  let s = 0;
  for (let i = lo; i < hi; i++) s += sorted[i]!;
  return s;
}

export function dropLabel(drop?: { mode: "high" | "low" | "highlow"; count: number }): string {
  if (!drop) return "";
  const n = drop.count;
  if (drop.mode === "highlow")
    return n === 1
      ? " (high-low)"
      : n === 2
        ? " (double high-low)"
        : ` (drop ${n} high & ${n} low)`;
  return ` (drop ${n === 1 ? "" : `${n} `}${drop.mode === "high" ? "highest" : "lowest"})`;
}
