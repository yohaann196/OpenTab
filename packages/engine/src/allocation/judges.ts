import type { JudgingSettings } from "../formats/schemas";
import { MinCostFlow } from "../optim/minCostFlow";
import type { EntryInfo, Finding, JudgeInfo } from "../types";
import type { PrefValue } from "./prefs";

/**
 * Judge allocation as a min-cost flow:
 *
 *   source → judge (cap = flights) → judge@flight (cap 1) → panel (cap 1) → sink (cap = panel size)
 *
 * Hard constraints (conflicts, strikes, same school, unavailability, owed
 * ballots) remove edges entirely, so they can never be violated
 * automatically. Soft preferences become edge costs. Max flow is found first
 * — every panel is filled if at all possible — and among those fillings the
 * cheapest is chosen.
 */

export interface PanelSlot {
  key: string;
  /** Human-readable name for messages. */
  label?: string;
  entryIds: string[];
  flight: number;
  /** Relative importance 0–1 (e.g. bubble or top brackets). */
  importance: number;
  size: number;
  /** Judges already fixed on this panel (locked by the tab). */
  fixedJudgeIds?: string[];
}

export interface JudgeAllocationInput {
  panels: readonly PanelSlot[];
  judges: readonly JudgeInfo[];
  entries: readonly EntryInfo[];
  /** entryId → judgeId → percentile or strike. */
  prefs?: ReadonlyMap<string, ReadonlyMap<string, PrefValue>>;
  /** judgeId → entries already judged. */
  history?: ReadonlyMap<string, ReadonlySet<string>>;
  settings: JudgingSettings;
  /** Congress: treat same-school as a soft cost instead of a hard block. */
  softSchoolConflicts?: boolean;
}

export interface JudgeCostTerm {
  term: "pref" | "mutuality" | "prefCeiling" | "rating" | "obligation" | "repeat" | "schoolSoft";
  cost: number;
  detail: string;
}

export interface PanelAssignment {
  panelKey: string;
  judges: { judgeId: string; role: "chair" | "panelist"; cost: number; explain: JudgeCostTerm[] }[];
}

export interface JudgeAllocationOutput {
  assignments: PanelAssignment[];
  findings: Finding[];
  totalCost: number;
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Why (or whether) a judge may hear a panel — also used by the draw editor. */
export function judgeEligibility(
  judge: JudgeInfo,
  panelEntryIds: readonly string[],
  ctx: Pick<JudgeAllocationInput, "entries" | "prefs" | "settings" | "softSchoolConflicts">,
  entryById: ReadonlyMap<string, EntryInfo> = new Map(ctx.entries.map((e) => [e.id, e])),
): Eligibility {
  if (judge.available === false) return { ok: false, reason: "unavailable this round" };
  if (judge.trainee) return { ok: false, reason: "trainee (placed manually)" };
  if (ctx.settings.blockOutstandingBallots && judge.hasOutstandingBallot) {
    return { ok: false, reason: "still owes a ballot from an earlier round" };
  }
  for (const id of panelEntryIds) {
    const e = entryById.get(id);
    if (judge.conflictEntryIds?.includes(id))
      return { ok: false, reason: `conflicted with ${e?.code ?? id}` };
    const pref = ctx.prefs?.get(id)?.get(judge.id);
    if (pref === "strike") return { ok: false, reason: `struck by ${e?.code ?? id}` };
    if (e?.schoolId) {
      const sameSchool =
        judge.schoolId === e.schoolId || judge.conflictSchoolIds?.includes(e.schoolId);
      if (sameSchool && !ctx.settings.allowSameSchool && !ctx.softSchoolConflicts) {
        return { ok: false, reason: `same school as ${e.code}` };
      }
    }
  }
  return { ok: true };
}

const UNRATED = 50;

export function judgePanelCost(
  judge: JudgeInfo,
  panel: PanelSlot,
  ctx: Pick<
    JudgeAllocationInput,
    "entries" | "prefs" | "settings" | "history" | "softSchoolConflicts"
  >,
  entryById: ReadonlyMap<string, EntryInfo>,
): JudgeCostTerm[] {
  const s = ctx.settings;
  const terms: JudgeCostTerm[] = [];
  const importance = 1 + 2 * Math.max(0, Math.min(1, panel.importance));

  if (s.prefs !== "none" && ctx.prefs) {
    const values = panel.entryIds.map((id) => {
      const v = ctx.prefs!.get(id)?.get(judge.id);
      return typeof v === "number" ? v : UNRATED;
    });
    const worst = Math.max(...values);
    const best = Math.min(...values);
    terms.push({
      term: "pref",
      cost: Math.round(worst * 100 * importance),
      detail: `worst pref ${worst}%`,
    });
    if (values.length > 1 && worst !== best) {
      terms.push({
        term: "mutuality",
        cost: Math.round((worst - best) * 50 * s.mutualityWeight),
        detail: `prefs differ by ${Math.round(worst - best)} pts`,
      });
    }
    if (worst > s.maxPrefPercentile) {
      terms.push({
        term: "prefCeiling",
        cost: Math.round((worst - s.maxPrefPercentile) * 5_000),
        detail: `above the ${s.maxPrefPercentile}% pref ceiling`,
      });
    }
  }

  const rating = judge.rating ?? 5;
  terms.push({
    term: "rating",
    cost: Math.round((10 - rating) * 20 * importance),
    detail: `tab rating ${rating}`,
  });

  const owed = judge.roundsOwed ?? 0;
  const judged = judge.roundsJudged ?? 0;
  if (owed > 0 && judged >= owed) {
    terms.push({ term: "obligation", cost: 800, detail: "obligation already met" });
  } else if (owed > 0) {
    terms.push({
      term: "obligation",
      cost: judged * 10,
      detail: `${judged}/${owed} rounds judged`,
    });
  }

  if (s.avoidRepeatJudging && ctx.history) {
    const seen = ctx.history.get(judge.id);
    const repeats = panel.entryIds.filter((id) => seen?.has(id));
    if (repeats.length) {
      terms.push({
        term: "repeat",
        cost: 60_000 * repeats.length,
        detail: `already judged ${repeats.map((id) => entryById.get(id)?.code ?? id).join(", ")}`,
      });
    }
  }

  if (ctx.softSchoolConflicts) {
    const same = panel.entryIds.filter((id) => {
      const sid = entryById.get(id)?.schoolId;
      return sid && (judge.schoolId === sid || judge.conflictSchoolIds?.includes(sid));
    });
    if (same.length)
      terms.push({
        term: "schoolSoft",
        cost: 30_000 * same.length,
        detail: "same school as a competitor",
      });
  }
  return terms;
}

export function allocateJudges(input: JudgeAllocationInput): JudgeAllocationOutput {
  const entryById = new Map(input.entries.map((e) => [e.id, e]));
  const findings: Finding[] = [];
  const fixed = new Set(input.panels.flatMap((p) => p.fixedJudgeIds ?? []));
  const judges = input.judges.filter((j) => !fixed.has(j.id));
  const flights = [...new Set(input.panels.map((p) => p.flight))].sort((a, b) => a - b);

  // Node layout.
  const SRC = 0;
  const SNK = 1;
  let next = 2;
  const judgeNode = new Map<string, number>();
  const jfNode = new Map<string, number>();
  const panelNode = new Map<string, number>();
  for (const j of judges) {
    judgeNode.set(j.id, next++);
    for (const f of flights) jfNode.set(`${j.id}@${f}`, next++);
  }
  for (const p of input.panels) panelNode.set(p.key, next++);
  const flow = new MinCostFlow(next);

  for (const j of judges) {
    flow.addEdge(SRC, judgeNode.get(j.id)!, flights.length, 0);
    for (const f of flights) flow.addEdge(judgeNode.get(j.id)!, jfNode.get(`${j.id}@${f}`)!, 1, 0);
  }
  const edgeInfo = new Map<
    number,
    { judgeId: string; panelKey: string; terms: JudgeCostTerm[]; cost: number }
  >();
  let needed = 0;
  for (const p of input.panels) {
    const need = Math.max(0, p.size - (p.fixedJudgeIds?.length ?? 0));
    needed += need;
    flow.addEdge(panelNode.get(p.key)!, SNK, need, 0);
    for (const j of judges) {
      if (!judgeEligibility(j, p.entryIds, input, entryById).ok) continue;
      const terms = judgePanelCost(j, p, input, entryById);
      const cost = terms.reduce((a, t) => a + t.cost, 0);
      const id = flow.addEdge(jfNode.get(`${j.id}@${p.flight}`)!, panelNode.get(p.key)!, 1, cost);
      edgeInfo.set(id, { judgeId: j.id, panelKey: p.key, terms, cost });
    }
  }
  const { flow: placed, cost } = flow.run(SRC, SNK);

  const byPanel = new Map<string, PanelAssignment["judges"]>();
  for (const p of input.panels) {
    byPanel.set(
      p.key,
      (p.fixedJudgeIds ?? []).map((id) => ({
        judgeId: id,
        role: "panelist" as const,
        cost: 0,
        explain: [],
      })),
    );
  }
  for (const [edgeId, info] of edgeInfo) {
    if (flow.flowOn(edgeId) > 0) {
      byPanel
        .get(info.panelKey)!
        .push({ judgeId: info.judgeId, role: "panelist", cost: info.cost, explain: info.terms });
    }
  }

  const judgeById = new Map(input.judges.map((j) => [j.id, j]));
  const assignments: PanelAssignment[] = input.panels.map((p) => {
    const list = byPanel.get(p.key)!;
    // Chair: highest tab rating, then cheapest placement.
    list.sort(
      (a, b) =>
        (judgeById.get(b.judgeId)?.rating ?? 0) - (judgeById.get(a.judgeId)?.rating ?? 0) ||
        a.cost - b.cost,
    );
    if (list[0]) list[0].role = "chair";
    if (list.length < p.size) {
      findings.push({
        code: "underfilled_panel",
        severity: "error",
        message: `${p.label ?? `Panel ${p.key}`} has ${list.length}/${p.size} judges.`,
        hint: "Add judges to the pool, relax pref ceilings, or place a judge manually.",
        pairingKeys: [p.key],
        entryIds: p.entryIds,
      });
    }
    for (const j of list) {
      if (j.explain.some((t) => t.term === "prefCeiling")) {
        findings.push({
          code: "pref_ceiling",
          severity: "warning",
          message: `${judgeById.get(j.judgeId)?.name ?? j.judgeId} is above the pref ceiling for ${p.label ?? p.key}.`,
          judgeIds: [j.judgeId],
          pairingKeys: [p.key],
        });
      }
      if (j.explain.some((t) => t.term === "repeat")) {
        findings.push({
          code: "repeat_judge",
          severity: "info",
          message: `${judgeById.get(j.judgeId)?.name ?? j.judgeId} has judged an entry in ${p.label ?? p.key} before.`,
          judgeIds: [j.judgeId],
          pairingKeys: [p.key],
        });
      }
    }
    return { panelKey: p.key, judges: list };
  });

  if (placed < needed) {
    findings.push({
      code: "judge_shortage",
      severity: "error",
      message: `Placed ${placed} of ${needed} judge slots.`,
      hint: "Not enough eligible judges. Check availability, conflicts and pools.",
    });
  }
  return { assignments, findings, totalCost: cost };
}
