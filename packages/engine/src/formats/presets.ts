import {
  type CongressConfig,
  type EventConfig,
  eventConfigSchema,
  type Format,
  type TwoTeamConfig,
  type WorldSchoolsConfig,
} from "./schemas";

/**
 * Format presets modelled on common US high-school practice (NSDA-style) and
 * WSDC rules. Tab directors start from these and override only what differs.
 */

const defaultPairing = {
  powermatch: "high_low",
  bracketOrder: "points",
  pullup: "highest",
  bracketByBallots: false,
  byePolicy: "lowest",
  avoidSameSchool: true,
  avoidSameRegion: false,
  presetRounds: 2,
  presetMethod: "random",
  weights: {},
} as const;

const defaultJudging = {
  prelimPanelSize: 1,
  elimPanelSize: 3,
  prefs: "none",
  tiers: [],
  strikes: 0,
  maxPrefPercentile: 100,
  mutualityWeight: 1,
  allowSameSchool: false,
  avoidRepeatJudging: true,
  blockOutstandingBallots: true,
} as const;

const standardTiebreaks: TwoTeamConfig["tiebreaks"] = [
  { key: "wins" },
  { key: "points", drop: { mode: "highlow", count: 1 } },
  { key: "points", drop: { mode: "highlow", count: 2 } },
  { key: "points" },
  { key: "opp_wins" },
  { key: "judge_variance" },
  { key: "coinflip" },
];

const speakerTiebreaks: TwoTeamConfig["speakerTiebreaks"] = [
  { key: "points", drop: { mode: "highlow", count: 1 } },
  { key: "points" },
  { key: "judge_variance" },
  { key: "coinflip" },
];

export const LD_PRESET: TwoTeamConfig = {
  format: "ld",
  teamSize: 1,
  speakersPerTeam: 1,
  sideLabels: ["Aff", "Neg"],
  sideMethod: "flip",
  pairing: { ...defaultPairing },
  judging: { ...defaultJudging, tiers: [] },
  ballot: {
    points: { min: 25, max: 30, step: 0.1, allowTies: true },
    lowPointWin: "warn",
    speakerRanks: false,
    rfdGraceHours: 72,
    requireRfd: false,
  },
  tiebreaks: standardTiebreaks,
  speakerTiebreaks,
  prelimRounds: 6,
  byeCountsAsWin: true,
};

export const PF_PRESET: TwoTeamConfig = {
  format: "pf",
  teamSize: 2,
  speakersPerTeam: 2,
  sideLabels: ["Pro", "Con"],
  sideMethod: "coin_flip",
  pairing: { ...defaultPairing },
  judging: { ...defaultJudging, tiers: [] },
  ballot: {
    points: { min: 25, max: 30, step: 0.1, allowTies: true },
    lowPointWin: "allow",
    speakerRanks: false,
    rfdGraceHours: 72,
    requireRfd: false,
  },
  tiebreaks: standardTiebreaks,
  speakerTiebreaks,
  prelimRounds: 5,
  byeCountsAsWin: true,
};

export const POLICY_PRESET: TwoTeamConfig = {
  format: "policy",
  teamSize: 2,
  speakersPerTeam: 2,
  sideLabels: ["Aff", "Neg"],
  sideMethod: "flip",
  pairing: { ...defaultPairing, presetRounds: 2 },
  judging: {
    ...defaultJudging,
    prefs: "ordinal",
    strikes: 0,
    maxPrefPercentile: 60,
    tiers: [],
  },
  ballot: {
    points: { min: 27, max: 30, step: 0.1, allowTies: true },
    lowPointWin: "warn",
    speakerRanks: true,
    rfdGraceHours: 72,
    requireRfd: false,
  },
  tiebreaks: [
    { key: "wins" },
    { key: "points", drop: { mode: "highlow", count: 1 } },
    { key: "points", drop: { mode: "highlow", count: 2 } },
    { key: "points" },
    { key: "ranks" },
    { key: "opp_wins" },
    { key: "coinflip" },
  ],
  speakerTiebreaks: [
    { key: "points", drop: { mode: "highlow", count: 1 } },
    { key: "points" },
    { key: "ranks" },
    { key: "coinflip" },
  ],
  prelimRounds: 6,
  byeCountsAsWin: true,
};

export const WSDC_PRESET: WorldSchoolsConfig = {
  format: "world_schools",
  teamSize: 5,
  speakersPerTeam: 3,
  sideLabels: ["Prop", "Opp"],
  sideMethod: "balance",
  pairing: { ...defaultPairing, presetRounds: 2 },
  judging: { ...defaultJudging, prelimPanelSize: 3, elimPanelSize: 5, tiers: [] },
  ballot: {
    points: { min: 60, max: 80, step: 0.5, allowTies: true },
    lowPointWin: "forbid",
    speakerRanks: false,
    rfdGraceHours: 72,
    requireRfd: false,
  },
  tiebreaks: [
    { key: "wins" },
    { key: "ballots" },
    { key: "points" },
    { key: "point_diff" },
    { key: "opp_wins" },
    { key: "coinflip" },
  ],
  speakerTiebreaks: [{ key: "points" }, { key: "coinflip" }],
  prelimRounds: 6,
  byeCountsAsWin: true,
  scoring: {
    style: { min: 24, max: 32 },
    content: { min: 24, max: 32 },
    strategy: { min: 12, max: 16 },
    replyFactor: 0.5,
    step: 0.5,
  },
  motions: { prepared: true, impromptu: true },
};

export const CONGRESS_PRESET: CongressConfig = {
  format: "congress",
  chamberSize: 16,
  speechPoints: { min: 1, max: 6 },
  ranksPerBallot: 8,
  presidingOfficer: { enabled: true, pointsMax: 6 },
  parliamentarian: true,
  scorersPerChamber: 3,
  tiebreaks: [
    { key: "rank_sum" },
    { key: "reciprocals" },
    { key: "judge_preference" },
    { key: "parli_ranks" },
    { key: "speech_points" },
    { key: "coinflip" },
  ],
  advancePerChamber: 6,
  prelimSessions: 2,
};

export const PRESETS: Record<Format, EventConfig> = {
  ld: LD_PRESET,
  pf: PF_PRESET,
  policy: POLICY_PRESET,
  world_schools: WSDC_PRESET,
  congress: CONGRESS_PRESET,
};

export const PRESET_DESCRIPTIONS: Record<Format, string> = {
  ld: "1v1 value debate. Side-locked flips, 25–30 points, 6 prelims.",
  pf: "2v2 current-events debate. Coin flip for sides, 5 prelims.",
  policy: "2v2 policy debate. Ordinal MPJ prefs, speaker ranks, 6 prelims.",
  world_schools: "3v3 (5-person squads). Style/content/strategy scoring, 3-judge panels.",
  congress: "Legislative debate in chambers. Speech points, top-8 ranks, PO scoring.",
};

/** Returns a deep copy of a preset, validated. */
export function presetFor(format: Format): EventConfig {
  return eventConfigSchema.parse(structuredClone(PRESETS[format]));
}
