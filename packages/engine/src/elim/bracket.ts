import type { Rng } from "../rng";
import type { DebateResult, EntryInfo, Finding, Side } from "../types";

/**
 * Elimination brackets: standard seeding (1 v N, with top seeds receiving byes
 * in partial brackets), advancement, closeouts and elim side rules.
 */

/** Seed numbers in bracket order, e.g. size 8 → [1, 8, 4, 5, 2, 7, 3, 6]. */
export function bracketOrder(size: number): number[] {
  if (size < 1 || (size & (size - 1)) !== 0) throw new Error("bracket size must be a power of two");
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

export const nextPowerOfTwo = (n: number): number => {
  let p = 1;
  while (p < n) p *= 2;
  return p;
};

export interface ElimSlot {
  entryId: string;
  seed: number;
}

export interface ElimMatch {
  /** Position of the match in the bracket, 0-based, top to bottom. */
  slot: number;
  high: ElimSlot;
  low: ElimSlot | null;
  bye: boolean;
}

/** Elim round name for a bracket with `teams` entries remaining. */
export function elimRoundName(teams: number): string {
  const names: Record<number, string> = {
    2: "Finals",
    4: "Semifinals",
    8: "Quarterfinals",
    16: "Octafinals",
    32: "Double Octafinals",
    64: "Triple Octafinals",
  };
  return names[teams] ?? `Round of ${teams}`;
}

/**
 * First elim round from a seeded break (best first). With a partial break
 * (not a power of two) the top seeds receive byes.
 */
export function seedFirstElimRound(breaking: readonly string[]): ElimMatch[] {
  const size = nextPowerOfTwo(Math.max(2, breaking.length));
  const order = bracketOrder(size);
  const matches: ElimMatch[] = [];
  for (let i = 0; i < size; i += 2) {
    const s1 = order[i]!;
    const s2 = order[i + 1]!;
    const [hi, lo] = s1 < s2 ? [s1, s2] : [s2, s1];
    const highId = breaking[hi - 1];
    const lowId = breaking[lo - 1];
    if (!highId) continue;
    matches.push({
      slot: i / 2,
      high: { entryId: highId, seed: hi },
      low: lowId ? { entryId: lowId, seed: lo } : null,
      bye: !lowId,
    });
  }
  return matches;
}

/**
 * Next round from the winners of the previous one. Without reseeding the
 * bracket is fixed (winner of slot 0 meets winner of slot 1, ...). With
 * reseeding the best remaining seed meets the worst.
 */
export function nextElimRound(
  winners: readonly (ElimSlot & { slot: number })[],
  reseed = false,
): ElimMatch[] {
  if (winners.length <= 1) return [];
  if (reseed) {
    const sorted = [...winners].sort((a, b) => a.seed - b.seed);
    const out: ElimMatch[] = [];
    for (let i = 0; i < sorted.length / 2; i++) {
      const hi = sorted[i]!;
      const lo = sorted[sorted.length - 1 - i] ?? null;
      out.push({
        slot: i,
        high: { entryId: hi.entryId, seed: hi.seed },
        low: lo && lo !== hi ? { entryId: lo.entryId, seed: lo.seed } : null,
        bye: !lo || lo === hi,
      });
    }
    return out;
  }
  const bySlot = [...winners].sort((a, b) => a.slot - b.slot);
  const out: ElimMatch[] = [];
  for (let i = 0; i < bySlot.length; i += 2) {
    const a = bySlot[i]!;
    const b = bySlot[i + 1];
    if (!b) {
      out.push({
        slot: Math.floor(a.slot / 2),
        high: { entryId: a.entryId, seed: a.seed },
        low: null,
        bye: true,
      });
      continue;
    }
    const [hi, lo] = a.seed <= b.seed ? [a, b] : [b, a];
    out.push({
      slot: Math.floor(a.slot / 2),
      high: { entryId: hi.entryId, seed: hi.seed },
      low: { entryId: lo.entryId, seed: lo.seed },
      bye: false,
    });
  }
  return out;
}

export interface ElimSidesResult {
  sides: [Side, Side];
  /** True when the sides must be decided by a coin flip at the round. */
  pending: boolean;
  reason: string;
}

/**
 * Elim sides: if the two entries met before, they switch sides from their most
 * recent meeting; otherwise a coin flip decides (sides pending).
 */
export function elimSides(
  high: string,
  low: string,
  history: readonly DebateResult[],
  rng: Rng,
): ElimSidesResult {
  const meetings = history
    .filter(
      (d) => d.sides.some((s) => s.entryId === high) && d.sides.some((s) => s.entryId === low),
    )
    .sort((a, b) => b.roundSeq - a.roundSeq);
  const last = meetings[0];
  if (last) {
    const prev = last.sides.find((s) => s.entryId === high)!.side;
    const next: Side = prev === "A" ? "B" : "A";
    return {
      sides: [next, next === "A" ? "B" : "A"],
      pending: false,
      reason: `Met in round ${last.roundSeq}; sides switch.`,
    };
  }
  const flip = rng.coin();
  return {
    sides: flip ? ["A", "B"] : ["B", "A"],
    pending: true,
    reason: "Did not meet before; coin flip.",
  };
}

/** Closeout warnings: same-school teams meeting in elims. */
export function closeoutFindings(
  matches: readonly ElimMatch[],
  entries: readonly EntryInfo[],
): Finding[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const out: Finding[] = [];
  for (const m of matches) {
    if (!m.low) continue;
    const a = byId.get(m.high.entryId);
    const b = byId.get(m.low.entryId);
    if (a?.schoolId && a.schoolId === b?.schoolId) {
      out.push({
        code: "closeout",
        severity: "info",
        message: `${a.code} and ${b.code} are from the same school (closeout).`,
        hint: "The school may choose to close out; record a walkover for the advancing entry.",
        entryIds: [a.id, b.id],
      });
    }
  }
  return out;
}
