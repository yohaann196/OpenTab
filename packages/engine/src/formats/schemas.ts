import { z } from "zod";

/**
 * Typed event configuration. One validated JSON document per event replaces
 * the hundreds of untyped key/value settings rows used by legacy software.
 */

export const FORMATS = ["policy", "ld", "pf", "congress", "world_schools"] as const;
export type Format = (typeof FORMATS)[number];
export const formatSchema = z.enum(FORMATS);

export const FORMAT_LABELS: Record<Format, string> = {
  policy: "Policy",
  ld: "Lincoln–Douglas",
  pf: "Public Forum",
  congress: "Congress",
  world_schools: "World Schools",
};

export const TEAM_TIEBREAK_KEYS = [
  "wins",
  "losses",
  "ballots",
  "points",
  "opp_wins",
  "opp_points",
  "point_diff",
  "ranks",
  "judge_variance",
  "head_to_head",
  "seed",
  "coinflip",
] as const;

export const CONGRESS_TIEBREAK_KEYS = [
  "rank_sum",
  "reciprocals",
  "judge_preference",
  "parli_ranks",
  "speech_points",
  "po_points",
  "seed",
  "coinflip",
] as const;

export const SPEAKER_TIEBREAK_KEYS = ["points", "ranks", "judge_variance", "coinflip"] as const;

export type TeamTiebreakKey = (typeof TEAM_TIEBREAK_KEYS)[number];
export type CongressTiebreakKey = (typeof CONGRESS_TIEBREAK_KEYS)[number];
export type SpeakerTiebreakKey = (typeof SPEAKER_TIEBREAK_KEYS)[number];

export const dropSchema = z.object({
  mode: z.enum(["high", "low", "highlow"]),
  count: z.number().int().min(1).max(5),
});
export type Drop = z.infer<typeof dropSchema>;

export const teamTiebreakSchema = z.object({
  key: z.enum(TEAM_TIEBREAK_KEYS),
  drop: dropSchema.optional(),
});
export const congressTiebreakSchema = z.object({
  key: z.enum(CONGRESS_TIEBREAK_KEYS),
  drop: dropSchema.optional(),
});
export const speakerTiebreakSchema = z.object({
  key: z.enum(SPEAKER_TIEBREAK_KEYS),
  drop: dropSchema.optional(),
});
export type TeamTiebreak = z.infer<typeof teamTiebreakSchema>;
export type CongressTiebreak = z.infer<typeof congressTiebreakSchema>;
export type SpeakerTiebreak = z.infer<typeof speakerTiebreakSchema>;

export const pointsSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    step: z.number().positive(),
    allowTies: z.boolean().default(true),
  })
  .refine((p) => p.max > p.min, { message: "max must exceed min" });

/** Pair-cost weights. All are overridable per event; defaults in pairing/cost.ts. */
export const pairingWeightsSchema = z
  .object({
    sameSchool: z.number().nonnegative(),
    rematch: z.number().nonnegative(),
    sideConflict: z.number().nonnegative(),
    sideLock: z.number().nonnegative(),
    bracketGap: z.number().nonnegative(),
    position: z.number().nonnegative(),
    sameRegion: z.number().nonnegative(),
    repeatPullup: z.number().nonnegative(),
  })
  .partial();

export const pairingSchema = z.object({
  /** How to pair power-matched rounds. */
  powermatch: z.enum(["high_low", "high_high"]).default("high_low"),
  /** Ordering within a bracket. `sop` = seed + opponent seed; `points` = speaker points. */
  bracketOrder: z.enum(["points", "sop", "opp_wins"]).default("points"),
  /** Which entry from the lower bracket is pulled up when a bracket is odd. */
  pullup: z.enum(["highest", "lowest", "random"]).default("highest"),
  bracketByBallots: z.boolean().default(false),
  byePolicy: z.enum(["lowest", "random", "middle"]).default("lowest"),
  avoidSameSchool: z.boolean().default(true),
  avoidSameRegion: z.boolean().default(false),
  /** Number of preset (non-power-matched) rounds at the start of the tournament. */
  presetRounds: z.number().int().min(0).max(10).default(2),
  /** Preset method. `protected` pairs seeds high-low; `balanced` spreads seeds. */
  presetMethod: z.enum(["random", "protected", "balanced"]).default("random"),
  weights: pairingWeightsSchema.default({}),
});

export const judgingSchema = z.object({
  prelimPanelSize: z.number().int().min(1).max(9).default(1),
  elimPanelSize: z.number().int().min(1).max(9).default(3),
  prefs: z.enum(["none", "ordinal", "tiers"]).default("none"),
  /** Tier quotas as a % of the judge pool (tiers mode). */
  tiers: z
    .array(
      z.object({
        name: z.string(),
        minPct: z.number().min(0).max(100),
        maxPct: z.number().min(0).max(100),
      }),
    )
    .default([]),
  /** Strikes allowed per entry (tiers/ordinal modes). */
  strikes: z.number().int().min(0).default(0),
  /** Preferred ceiling: judges above this percentile are placed only when unavoidable. */
  maxPrefPercentile: z.number().min(0).max(100).default(100),
  /** How strongly to prefer mutual (equal) preferences. */
  mutualityWeight: z.number().min(0).default(1),
  allowSameSchool: z.boolean().default(false),
  avoidRepeatJudging: z.boolean().default(true),
  /** Don't place judges who still owe a ballot from an earlier round. */
  blockOutstandingBallots: z.boolean().default(true),
});

export const ballotSchema = z.object({
  points: pointsSchema,
  lowPointWin: z.enum(["allow", "warn", "forbid"]).default("warn"),
  speakerRanks: z.boolean().default(false),
  /** Judges may submit the decision first and finish the RFD later (hours). */
  rfdGraceHours: z
    .number()
    .int()
    .min(0)
    .max(24 * 14)
    .default(72),
  requireRfd: z.boolean().default(false),
});

const twoTeamBase = {
  name: z.string().optional(),
  teamSize: z.number().int().min(1).max(5),
  speakersPerTeam: z.number().int().min(1).max(5),
  sideLabels: z.tuple([z.string(), z.string()]),
  /**
   * `balance`: sides assigned to even out each team's Aff/Neg count.
   * `flip`: even rounds lock sides opposite the previous round.
   * `coin_flip`: sides decided by a coin flip at the round (PF).
   */
  sideMethod: z.enum(["balance", "flip", "coin_flip"]),
  pairing: pairingSchema,
  judging: judgingSchema,
  ballot: ballotSchema,
  tiebreaks: z.array(teamTiebreakSchema).min(1),
  speakerTiebreaks: z.array(speakerTiebreakSchema).min(1),
  prelimRounds: z.number().int().min(1).max(12),
  byeCountsAsWin: z.boolean().default(true),
};

export const twoTeamConfigSchema = z.object({
  format: z.enum(["policy", "ld", "pf"]),
  ...twoTeamBase,
});

export const worldSchoolsConfigSchema = z.object({
  format: z.literal("world_schools"),
  ...twoTeamBase,
  scoring: z.object({
    style: z.object({ min: z.number(), max: z.number() }),
    content: z.object({ min: z.number(), max: z.number() }),
    strategy: z.object({ min: z.number(), max: z.number() }),
    replyFactor: z.number().positive().default(0.5),
    step: z.number().positive().default(0.5),
  }),
  motions: z
    .object({ prepared: z.boolean().default(true), impromptu: z.boolean().default(true) })
    .default({ prepared: true, impromptu: true }),
});

export const congressConfigSchema = z.object({
  format: z.literal("congress"),
  name: z.string().optional(),
  chamberSize: z.number().int().min(4).max(40).default(16),
  speechPoints: z.object({ min: z.number().int(), max: z.number().int() }),
  ranksPerBallot: z.number().int().min(1).max(20).default(8),
  presidingOfficer: z.object({
    enabled: z.boolean().default(true),
    pointsMax: z.number().int().min(1).default(6),
  }),
  parliamentarian: z.boolean().default(true),
  scorersPerChamber: z.number().int().min(1).max(9).default(3),
  tiebreaks: z.array(congressTiebreakSchema).min(1),
  /** Top N per chamber advance to the next level. */
  advancePerChamber: z.number().int().min(1).default(6),
  prelimSessions: z.number().int().min(1).max(8).default(2),
});

export const eventConfigSchema = z.discriminatedUnion("format", [
  twoTeamConfigSchema,
  worldSchoolsConfigSchema,
  congressConfigSchema,
]);

export type TwoTeamConfig = z.infer<typeof twoTeamConfigSchema>;
export type WorldSchoolsConfig = z.infer<typeof worldSchoolsConfigSchema>;
export type CongressConfig = z.infer<typeof congressConfigSchema>;
export type EventConfig = z.infer<typeof eventConfigSchema>;
export type DebateConfig = TwoTeamConfig | WorldSchoolsConfig;
export type PairingSettings = z.infer<typeof pairingSchema>;
export type JudgingSettings = z.infer<typeof judgingSchema>;
export type BallotSettings = z.infer<typeof ballotSchema>;

export const isDebateConfig = (c: EventConfig): c is DebateConfig => c.format !== "congress";
