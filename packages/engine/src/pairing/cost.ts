import type { PairingSettings } from "../formats/schemas";

/**
 * Pair-cost model. Every term is named, documented and overridable per event,
 * so a tab director can see exactly why the engine preferred one pairing over
 * another (no magic constants buried in code).
 */
export interface PairingWeights {
  /** Two entries from the same school meet. Effectively hard. */
  sameSchool: number;
  /** Two entries meet for a second time. Effectively hard. */
  rematch: number;
  /** Both entries are due the same side (balance rounds). */
  sideConflict: number;
  /** Both entries are side-locked to the same side (flip rounds). Outranks bracket integrity. */
  sideLock: number;
  /** Per squared bracket (record) level the two entries are apart. */
  bracketGap: number;
  /** Per squared place of deviation from the ideal opponent inside a bracket. */
  position: number;
  /** Two entries from the same region/state meet (only when avoidSameRegion). */
  sameRegion: number;
  /** Pulling up an entry that has already been pulled up. */
  repeatPullup: number;
}

export const DEFAULT_WEIGHTS: PairingWeights = {
  sameSchool: 10_000_000,
  rematch: 50_000_000,
  sideConflict: 20_000,
  sideLock: 5_000_000,
  bracketGap: 1_000_000,
  position: 10,
  sameRegion: 5_000,
  repeatPullup: 100_000,
};

export function resolveWeights(settings: PairingSettings): PairingWeights {
  return { ...DEFAULT_WEIGHTS, ...(settings.weights as Partial<PairingWeights>) };
}

export interface CostTerm {
  term: keyof PairingWeights | "noise";
  cost: number;
  detail: string;
}

export const TERM_LABELS: Record<CostTerm["term"], string> = {
  sameSchool: "Same school",
  rematch: "Rematch",
  sideConflict: "Side conflict",
  sideLock: "Side lock",
  bracketGap: "Different brackets",
  position: "Bracket position",
  sameRegion: "Same region",
  repeatPullup: "Repeat pull-up",
  noise: "Random tie-break",
};
