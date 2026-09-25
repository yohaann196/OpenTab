/**
 * Core engine data types. These are plain, serialisable objects — the database
 * layer maps its rows into these shapes and the engine never touches IO.
 */

/** Generic side slot: A = Aff / Pro / Proposition, B = Neg / Con / Opposition. */
export type Side = "A" | "B";

export const otherSide = (s: Side): Side => (s === "A" ? "B" : "A");

export type Severity = "error" | "warning" | "info";

export interface Finding {
  code: string;
  severity: Severity;
  message: string;
  /** Human-readable suggestion for fixing the problem. */
  hint?: string;
  entryIds?: string[];
  judgeIds?: string[];
  roomIds?: string[];
  pairingKeys?: string[];
}

export interface EntryInfo {
  id: string;
  code: string;
  schoolId: string | null;
  regionId?: string | null;
  /** Tab-assigned seed (lower is better) used for seeded presets and tiebreaks. */
  seed?: number | null;
  requiresAccessible?: boolean;
  active?: boolean;
}

export interface CompetitorInfo {
  id: string;
  entryId: string;
  name: string;
}

export interface JudgeInfo {
  id: string;
  name: string;
  schoolId: string | null;
  /** Additional schools the judge is conflicted with (e.g. alumni). */
  conflictSchoolIds?: string[];
  /** Entry ids the judge must never hear (conflicts & strikes). */
  conflictEntryIds?: string[];
  /** Tab rating 0–10; higher = more experienced / trusted. */
  rating?: number;
  /** Rounds this judge is obligated to judge in the tournament. */
  roundsOwed?: number;
  /** Rounds already judged. */
  roundsJudged?: number;
  available?: boolean;
  /** True if the judge still owes a ballot from an earlier round. */
  hasOutstandingBallot?: boolean;
  /** Trainee / shadow judges never count toward a panel's decision. */
  trainee?: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  /** Higher priority rooms get the most important debates. */
  priority?: number;
  capacity?: number | null;
  accessible?: boolean;
  available?: boolean;
}

/** A speaker score on one ballot. */
export interface SpeakerScore {
  entryId: string;
  competitorId: string;
  /** Speaking position (1-based); reply speeches use `reply: true`. */
  position: number;
  points: number;
  rank?: number | null;
  reply?: boolean;
}

/** One judge's decision in a two-team debate. */
export interface BallotResult {
  judgeId: string;
  /** Winning entry, or null for a double-loss / no decision. */
  winnerId: string | null;
  scores: SpeakerScore[];
  chair?: boolean;
  trainee?: boolean;
}

/** A completed (or partially completed) two-team debate. */
export interface DebateResult {
  roundId: string;
  roundSeq: number;
  stage: "prelim" | "elim";
  pairingId: string;
  /** Entries and their sides. A bye has exactly one entry. */
  sides: { entryId: string; side: Side }[];
  bye?: boolean;
  /** Entry id that forfeited (lost without debating). */
  forfeitId?: string | null;
  /** Entries that were pulled up into a higher bracket for this debate. */
  pulledUpIds?: string[];
  ballots: BallotResult[];
}

export interface RoundInfo {
  id: string;
  seq: number;
  stage: "prelim" | "elim";
}

/** Exhaustiveness guard for switch statements. */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
