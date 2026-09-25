import type { CongressConfig, DebateConfig, WorldSchoolsConfig } from "../formats/schemas";
import type { Finding, SpeakerScore } from "../types";

/**
 * Ballot validation. Returns errors (block submission) and warnings (require
 * explicit confirmation, e.g. a low-point win). Used identically by the judge's
 * phone ballot, tab-room data entry and the API.
 */

export interface BallotValidation {
  errors: Finding[];
  warnings: Finding[];
  /** Team totals by entry id. */
  totals: Record<string, number>;
}

export interface TwoTeamBallotInput {
  winnerId: string | null;
  scores: (SpeakerScore & { components?: { style: number; content: number; strategy: number } })[];
}

export interface DebateShape {
  entries: { entryId: string; side: "A" | "B" }[];
  /** Eligible competitor ids per entry. */
  competitors: Record<string, string[]>;
}

const onStep = (value: number, min: number, step: number): boolean => {
  const k = (value - min) / step;
  return Math.abs(k - Math.round(k)) < 1e-6;
};

export function validateTwoTeamBallot(
  ballot: TwoTeamBallotInput,
  debate: DebateShape,
  config: DebateConfig,
): BallotValidation {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const err = (code: string, message: string) => errors.push({ code, severity: "error", message });
  const ids = debate.entries.map((e) => e.entryId);

  if (!ballot.winnerId || !ids.includes(ballot.winnerId))
    err("no_winner", "Select the winning team.");

  const totals: Record<string, number> = {};
  const isWsdc = config.format === "world_schools";
  const wsdc = isWsdc ? (config as WorldSchoolsConfig).scoring : null;

  for (const id of ids) {
    const mine = ballot.scores.filter((s) => s.entryId === id);
    const substantive = mine.filter((s) => !s.reply);
    const replies = mine.filter((s) => s.reply);
    if (substantive.length !== config.speakersPerTeam) {
      err("speaker_count", `Enter ${config.speakersPerTeam} speaker score(s) per team.`);
    }
    const eligible = new Set(debate.competitors[id] ?? []);
    const seenComp = new Set<string>();
    const seenPos = new Set<number>();
    for (const s of substantive) {
      if (eligible.size && !eligible.has(s.competitorId))
        err("bad_speaker", "A speaker is not on this team.");
      if (seenComp.has(s.competitorId) && config.speakersPerTeam > 1 && !isWsdc) {
        err("duplicate_speaker", "The same speaker is listed twice.");
      }
      if (seenPos.has(s.position))
        err("duplicate_position", "Two speakers share a speaking position.");
      seenComp.add(s.competitorId);
      seenPos.add(s.position);
    }
    if (isWsdc) {
      if (replies.length !== 1) err("reply", "Enter one reply speech per team.");
      for (const r of replies) {
        const subst = substantive.find((s) => s.competitorId === r.competitorId);
        if (subst && subst.position === 3)
          err("reply_speaker", "The third speaker cannot give the reply.");
      }
    }
    for (const s of mine) {
      if (wsdc && s.components) {
        const f = s.reply ? wsdc.replyFactor : 1;
        const parts = [
          ["Style", s.components.style, wsdc.style],
          ["Content", s.components.content, wsdc.content],
          ["Strategy", s.components.strategy, wsdc.strategy],
        ] as const;
        for (const [label, v, range] of parts) {
          if (v < range.min * f - 1e-9 || v > range.max * f + 1e-9) {
            err(
              "component_range",
              `${label} must be between ${range.min * f} and ${range.max * f}.`,
            );
          }
          if (!onStep(v, 0, wsdc.step * (s.reply ? 0.5 : 1)))
            err("component_step", `${label} uses an invalid increment.`);
        }
        const sum = s.components.style + s.components.content + s.components.strategy;
        if (Math.abs(sum - s.points) > 1e-6)
          err("component_sum", "Speaker total must equal style + content + strategy.");
      } else if (!isWsdc) {
        const { min, max, step } = config.ballot.points;
        if (s.points < min || s.points > max)
          err("points_range", `Points must be between ${min} and ${max}.`);
        else if (!onStep(s.points, min, step))
          err("points_step", `Points must be in increments of ${step}.`);
      } else {
        const f = s.reply ? wsdc!.replyFactor : 1;
        const { min, max } = config.ballot.points;
        if (s.points < min * f || s.points > max * f)
          err("points_range", `Points must be between ${min * f} and ${max * f}.`);
      }
    }
    totals[id] = Math.round(mine.reduce((a, s) => a + s.points, 0) * 100) / 100;
  }

  if (!config.ballot.points.allowTies && !isWsdc) {
    const pts = ballot.scores.filter((s) => !s.reply).map((s) => s.points);
    if (new Set(pts).size !== pts.length)
      err("point_tie", "Speaker points may not be tied on this ballot.");
  }

  if (config.ballot.speakerRanks && !isWsdc) {
    const ranked = ballot.scores.filter((s) => !s.reply);
    const ranks = ranked.map((s) => s.rank);
    const n = ranked.length;
    const valid = ranks.every((r) => r != null && r >= 1 && r <= n) && new Set(ranks).size === n;
    if (!valid) err("ranks", `Rank speakers 1–${n} with no ties.`);
    else {
      const inconsistent = ranked.some((a) =>
        ranked.some((b) => a.points > b.points && (a.rank ?? 0) > (b.rank ?? 0)),
      );
      if (inconsistent) {
        warnings.push({
          code: "rank_points_mismatch",
          severity: "warning",
          message: "Ranks don't follow speaker points.",
        });
      }
    }
  }

  if (ballot.winnerId && ids.length === 2 && errors.length === 0) {
    const loser = ids.find((i) => i !== ballot.winnerId)!;
    const w = totals[ballot.winnerId] ?? 0;
    const l = totals[loser] ?? 0;
    if (l > w) {
      const f: Finding = {
        code: "low_point_win",
        severity: config.ballot.lowPointWin === "forbid" ? "error" : "warning",
        message: `Low-point win: the winner has ${w} points and the loser ${l}.`,
        hint: "Confirm this is intentional, or adjust points.",
      };
      if (config.ballot.lowPointWin === "forbid") errors.push(f);
      else if (config.ballot.lowPointWin === "warn") warnings.push(f);
    } else if (isWsdc && l === w) {
      errors.push({
        code: "tied_totals",
        severity: "error",
        message: "Team totals cannot be tied in World Schools.",
      });
    }
  }
  return { errors, warnings, totals };
}

export interface CongressBallotInput {
  /** Per-speech points. An entry may give several speeches. */
  speeches: { entryId: string; points: number }[];
  ranks: { entryId: string; rank: number }[];
  po?: { entryId: string; points: number } | null;
}

export function validateCongressBallot(
  ballot: CongressBallotInput,
  chamberEntryIds: readonly string[],
  config: CongressConfig,
): BallotValidation {
  const errors: Finding[] = [];
  const warnings: Finding[] = [];
  const members = new Set(chamberEntryIds);
  const { min, max } = config.speechPoints;
  for (const s of ballot.speeches) {
    if (!members.has(s.entryId))
      errors.push({
        code: "not_in_chamber",
        severity: "error",
        message: "Speech by a legislator not in this chamber.",
      });
    if (!Number.isInteger(s.points) || s.points < min || s.points > max) {
      errors.push({
        code: "speech_points",
        severity: "error",
        message: `Speech points must be whole numbers ${min}–${max}.`,
      });
    }
  }
  const maxRanks = Math.min(config.ranksPerBallot, chamberEntryIds.length);
  const rankVals = ballot.ranks.map((r) => r.rank);
  if (new Set(ballot.ranks.map((r) => r.entryId)).size !== ballot.ranks.length) {
    errors.push({
      code: "duplicate_ranked",
      severity: "error",
      message: "A legislator is ranked twice.",
    });
  }
  if (new Set(rankVals).size !== rankVals.length)
    errors.push({ code: "rank_tie", severity: "error", message: "Ranks must be unique." });
  if (rankVals.some((r) => !Number.isInteger(r) || r < 1 || r > maxRanks)) {
    errors.push({ code: "rank_range", severity: "error", message: `Ranks must be 1–${maxRanks}.` });
  }
  if (ballot.ranks.length < maxRanks) {
    warnings.push({
      code: "incomplete_ranks",
      severity: "warning",
      message: `Only ${ballot.ranks.length} of ${maxRanks} ranks given.`,
    });
  }
  for (const r of ballot.ranks)
    if (!members.has(r.entryId))
      errors.push({
        code: "not_in_chamber",
        severity: "error",
        message: "Ranked legislator not in this chamber.",
      });
  if (ballot.po) {
    if (!config.presidingOfficer.enabled)
      errors.push({ code: "po_disabled", severity: "error", message: "PO scoring is disabled." });
    else if (ballot.po.points < 1 || ballot.po.points > config.presidingOfficer.pointsMax) {
      errors.push({
        code: "po_points",
        severity: "error",
        message: `PO points must be 1–${config.presidingOfficer.pointsMax}.`,
      });
    }
  }
  const totals: Record<string, number> = {};
  for (const s of ballot.speeches) totals[s.entryId] = (totals[s.entryId] ?? 0) + s.points;
  return { errors, warnings, totals };
}
