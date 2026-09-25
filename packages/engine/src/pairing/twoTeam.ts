import type { DebateConfig } from "../formats/schemas";
import { minCostPerfectMatching } from "../optim/blossom";
import { Rng } from "../rng";
import { computeTeamStandings } from "../standings/team";
import { type DebateResult, type EntryInfo, type Finding, otherSide, type Side } from "../types";
import { type CostTerm, type PairingWeights, resolveWeights } from "./cost";
import { buildRecords, type EntryRecord } from "./records";

export type PairingMethod = "auto" | "random" | "protected" | "balanced" | "powermatch";

export interface PairRoundInput {
  entries: readonly EntryInfo[];
  /** All prior prelim results for this event. */
  results: readonly DebateResult[];
  roundSeq: number;
  config: DebateConfig;
  method?: PairingMethod;
  /** Deterministic seed (e.g. round id + version). */
  seed: string;
  /** Debates to keep untouched (entries excluded from re-pairing). */
  locked?: readonly { entryIds: readonly string[]; sides?: readonly Side[] }[];
}

export interface PairedDebate {
  key: string;
  entries: { entryId: string; side: Side }[];
  bye: boolean;
  /** Record bracket (wins) of the higher entry; null for unbracketed rounds. */
  bracket: number | null;
  pulledUpIds: string[];
  /** True when sides are decided later by a coin flip (PF). */
  sidesPending: boolean;
  locked: boolean;
  cost: number;
  explain: CostTerm[];
}

export interface PairRoundOutput {
  method: Exclude<PairingMethod, "auto">;
  debates: PairedDebate[];
  findings: Finding[];
}

interface Node {
  rec: EntryRecord;
  /** Effective bracket index after pull-ups (0 = top). */
  group: number;
  /** Position inside the effective bracket (0 = best). */
  pos: number;
  groupSize: number;
  pulledUp: boolean;
  bracketValue: number;
}

export function resolveMethod(input: PairRoundInput): Exclude<PairingMethod, "auto"> {
  const m = input.method ?? "auto";
  if (m !== "auto") return m;
  if (input.roundSeq <= input.config.pairing.presetRounds) return input.config.pairing.presetMethod;
  return "powermatch";
}

/** Which side an entry is "due": positive → due side A, negative → due B. */
function sideDue(rec: EntryRecord): number {
  return rec.sideCounts.B - rec.sideCounts.A;
}

export function pairTwoTeamRound(input: PairRoundInput): PairRoundOutput {
  const { config } = input;
  const rng = new Rng(input.seed);
  const weights = resolveWeights(config.pairing);
  const method = resolveMethod(input);
  const findings: Finding[] = [];

  const active = input.entries.filter((e) => e.active !== false);
  const lockedIds = new Set((input.locked ?? []).flatMap((l) => l.entryIds));
  const records = buildRecords(active, input.results, { byeCountsAsWin: config.byeCountsAsWin });

  const debates: PairedDebate[] = [];
  for (const [i, l] of (input.locked ?? []).entries()) {
    debates.push({
      key: `locked-${i}`,
      entries: l.entryIds.map((id, k) => ({
        entryId: id,
        side: l.sides?.[k] ?? (k === 0 ? "A" : "B"),
      })),
      bye: l.entryIds.length === 1,
      bracket: null,
      pulledUpIds: [],
      sidesPending: false,
      locked: true,
      cost: 0,
      explain: [],
    });
  }

  let pool = active.filter((e) => !lockedIds.has(e.id));

  // ---- ordering -----------------------------------------------------------
  const order = orderEntries(pool, input, method, records, rng);
  pool = order;

  // ---- bye ----------------------------------------------------------------
  if (pool.length % 2 === 1) {
    const byeEntry = chooseBye(pool, records, config.pairing.byePolicy, method, rng);
    pool = pool.filter((e) => e.id !== byeEntry.id);
    debates.push({
      key: `bye-${byeEntry.id}`,
      entries: [{ entryId: byeEntry.id, side: "A" }],
      bye: true,
      bracket: records.get(byeEntry.id)!.wins,
      pulledUpIds: [],
      sidesPending: false,
      locked: false,
      cost: 0,
      explain: [],
    });
    findings.push({
      code: "bye",
      severity: "info",
      message: `${byeEntry.code} receives a bye.`,
      entryIds: [byeEntry.id],
    });
    if (records.get(byeEntry.id)!.byes > 0) {
      findings.push({
        code: "repeat_bye",
        severity: "warning",
        message: `${byeEntry.code} has already had a bye.`,
        hint: "Every entry has had a bye; consider adding a hybrid or house entry.",
        entryIds: [byeEntry.id],
      });
    }
  }

  // ---- brackets & pull-ups -------------------------------------------------
  const nodes = buildNodes(pool, records, method, config, rng, weights);

  // ---- global min-cost matching -------------------------------------------
  const noise = new Map<string, number>();
  const noiseFor = (a: string, b: string): number => {
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    let v = noise.get(k);
    if (v === undefined) {
      v = rng.int(1000);
      noise.set(k, v);
    }
    return v;
  };

  const termsFor = (a: Node, b: Node): CostTerm[] =>
    pairTerms(a, b, method, config, input.roundSeq, weights, noiseFor);

  const pairs = minCostPerfectMatching(nodes.length, (i, j) =>
    termsFor(nodes[i]!, nodes[j]!).reduce((s, t) => s + t.cost, 0),
  );

  for (const [i, j] of pairs) {
    const a = nodes[i]!;
    const b = nodes[j]!;
    const terms = termsFor(a, b).filter((t) => t.cost > 0);
    const [sa] = assignSides(a.rec, b.rec, config, input.roundSeq, rng);
    const [first, second] = sa === "A" ? [a, b] : [b, a];
    const pulled = [a, b].filter((n) => n.pulledUp).map((n) => n.rec.entry.id);
    const bracket = method === "powermatch" ? Math.max(a.bracketValue, b.bracketValue) : null;
    debates.push({
      key: `${first.rec.entry.id}:${second.rec.entry.id}`,
      entries: [
        { entryId: first.rec.entry.id, side: "A" },
        { entryId: second.rec.entry.id, side: "B" },
      ],
      bye: false,
      bracket,
      pulledUpIds: pulled,
      sidesPending: config.sideMethod === "coin_flip",
      locked: false,
      cost: terms.reduce((s, t) => s + t.cost, 0),
      explain: terms,
    });
    for (const t of terms) {
      if (
        t.term === "sameSchool" ||
        t.term === "rematch" ||
        t.term === "sideConflict" ||
        t.term === "sideLock"
      ) {
        findings.push({
          code:
            t.term === "sameSchool"
              ? "same_school"
              : t.term === "rematch"
                ? "rematch"
                : "side_conflict",
          severity: t.term === "sideConflict" || t.term === "sideLock" ? "warning" : "error",
          message: `${a.rec.entry.code} vs ${b.rec.entry.code}: ${t.detail}`,
          hint:
            t.term === "sideConflict" || t.term === "sideLock"
              ? "Both entries are due the same side; one will debate an extra round on that side."
              : "No valid alternative exists; consider swapping manually in the draw editor.",
          entryIds: [a.rec.entry.id, b.rec.entry.id],
        });
      }
    }
    if (pulled.length > 0 && method === "powermatch") {
      findings.push({
        code: "pullup",
        severity: "info",
        message: `${pulled.map((id) => records.get(id)!.entry.code).join(", ")} pulled up to the ${bracket}-win bracket.`,
        entryIds: pulled,
      });
    }
  }

  // Order debates: top brackets first, byes last.
  debates.sort((x, y) => {
    if (x.bye !== y.bye) return x.bye ? 1 : -1;
    return (y.bracket ?? 0) - (x.bracket ?? 0);
  });
  return { method, debates, findings };
}

function orderEntries(
  pool: readonly EntryInfo[],
  input: PairRoundInput,
  method: Exclude<PairingMethod, "auto">,
  records: Map<string, EntryRecord>,
  rng: Rng,
): EntryInfo[] {
  if (method === "random") return rng.shuffle(pool);
  if (method === "protected" || method === "balanced") {
    const shuffled = rng.shuffle(pool);
    return [...shuffled].sort(
      (a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER),
    );
  }
  // Powermatch: order by bracket then configured in-bracket metric.
  const orderKey = input.config.pairing.bracketOrder;
  const tiebreaks =
    orderKey === "opp_wins"
      ? ([{ key: "wins" }, { key: "opp_wins" }, { key: "points" }, { key: "coinflip" }] as const)
      : ([{ key: "wins" }, { key: "points" }, { key: "opp_wins" }, { key: "coinflip" }] as const);
  const st = computeTeamStandings(pool, input.results, [...tiebreaks], {
    byeCountsAsWin: input.config.byeCountsAsWin,
    seed: input.seed,
  });
  const order = st.rows.map((r) => r.item.record.entry);
  if (orderKey === "sop") {
    // Seed + opponent seed: lower is better. Position from standings is the seed.
    const pos = new Map(order.map((e, i) => [e.id, i + 1]));
    const sop = (e: EntryInfo) => {
      const rec = records.get(e.id)!;
      const opp = rec.opponents.map((o) => pos.get(o) ?? order.length);
      const oppAvg = opp.length ? opp.reduce((a, b) => a + b, 0) / opp.length : order.length / 2;
      return pos.get(e.id)! + oppAvg;
    };
    const bracketOf = (e: EntryInfo) => bracketValueOf(records.get(e.id)!, input.config);
    return [...order].sort((a, b) => bracketOf(b) - bracketOf(a) || sop(a) - sop(b));
  }
  if (input.config.pairing.bracketByBallots) {
    const bracketOf = (e: EntryInfo) => bracketValueOf(records.get(e.id)!, input.config);
    return [...order].sort((a, b) => bracketOf(b) - bracketOf(a));
  }
  return order;
}

function bracketValueOf(rec: EntryRecord, config: DebateConfig): number {
  return config.pairing.bracketByBallots ? rec.ballotsWon : rec.wins;
}

function chooseBye(
  pool: readonly EntryInfo[],
  records: Map<string, EntryRecord>,
  policy: "lowest" | "random" | "middle",
  method: Exclude<PairingMethod, "auto">,
  rng: Rng,
): EntryInfo {
  const minByes = Math.min(...pool.map((e) => records.get(e.id)!.byes));
  const eligible = pool.filter((e) => records.get(e.id)!.byes === minByes);
  if (method === "random" || policy === "random") return rng.pick(eligible);
  if (policy === "middle") return eligible[Math.floor(eligible.length / 2)]!;
  return eligible[eligible.length - 1]!;
}

function buildNodes(
  pool: readonly EntryInfo[],
  records: Map<string, EntryRecord>,
  method: Exclude<PairingMethod, "auto">,
  config: DebateConfig,
  rng: Rng,
  weights: PairingWeights,
): Node[] {
  if (method !== "powermatch") {
    return pool.map((e, i) => ({
      rec: records.get(e.id)!,
      group: 0,
      pos: i,
      groupSize: pool.length,
      pulledUp: false,
      bracketValue: 0,
    }));
  }

  // Group by bracket, in order (pool is already sorted best → worst).
  const brackets: EntryInfo[][] = [];
  let lastVal: number | null = null;
  for (const e of pool) {
    const v = bracketValueOf(records.get(e.id)!, config);
    if (v !== lastVal) {
      brackets.push([]);
      lastVal = v;
    }
    brackets[brackets.length - 1]!.push(e);
  }

  const pulledUp = new Set<string>();
  // Resolve odd brackets top-down by pulling up from the next bracket.
  for (let b = 0; b < brackets.length - 1; b++) {
    const cur = brackets[b]!;
    if (cur.length % 2 === 0) continue;
    const below = brackets[b + 1]!;
    const candidates = below.filter((e) => !pulledUp.has(e.id));
    const fresh = candidates.filter((e) => records.get(e.id)!.pullups === 0);
    const pickFrom = fresh.length > 0 && weights.repeatPullup > 0 ? fresh : candidates;
    // Prefer a candidate that has a legal opponent (not same school / not met) in the bracket.
    const legal = pickFrom.filter((c) =>
      cur.some(
        (x) =>
          !(config.pairing.avoidSameSchool && x.schoolId && x.schoolId === c.schoolId) &&
          !records.get(x.id)!.opponents.includes(c.id),
      ),
    );
    const list = legal.length > 0 ? legal : pickFrom;
    let chosen: EntryInfo;
    if (config.pairing.pullup === "random") chosen = rng.pick(list);
    else if (config.pairing.pullup === "lowest") chosen = list[list.length - 1]!;
    else chosen = list[0]!;
    below.splice(below.indexOf(chosen), 1);
    cur.push(chosen);
    pulledUp.add(chosen.id);
  }

  const nodes: Node[] = [];
  brackets
    .filter((b) => b.length > 0)
    .forEach((b, gi) => {
      b.forEach((e, pi) => {
        const rec = records.get(e.id)!;
        nodes.push({
          rec,
          group: gi,
          pos: pi,
          groupSize: b.length,
          pulledUp: pulledUp.has(e.id),
          bracketValue: bracketValueOf(rec, config),
        });
      });
    });
  return nodes;
}

function pairTerms(
  a: Node,
  b: Node,
  method: Exclude<PairingMethod, "auto">,
  config: DebateConfig,
  roundSeq: number,
  w: PairingWeights,
  noiseFor: (a: string, b: string) => number,
): CostTerm[] {
  const terms: CostTerm[] = [];
  const ea = a.rec.entry;
  const eb = b.rec.entry;

  if (config.pairing.avoidSameSchool && ea.schoolId && ea.schoolId === eb.schoolId) {
    terms.push({ term: "sameSchool", cost: w.sameSchool, detail: "same school" });
  }
  if (config.pairing.avoidSameRegion && ea.regionId && ea.regionId === eb.regionId) {
    terms.push({ term: "sameRegion", cost: w.sameRegion, detail: "same region" });
  }
  if (a.rec.opponents.includes(eb.id)) {
    terms.push({ term: "rematch", cost: w.rematch, detail: "already met" });
  }

  // Side constraints.
  if (config.sideMethod !== "coin_flip") {
    const flipRound = config.sideMethod === "flip" && roundSeq % 2 === 0;
    if (flipRound && a.rec.lastSide && a.rec.lastSide === b.rec.lastSide) {
      terms.push({
        term: "sideLock",
        cost: w.sideLock,
        detail: `both were ${sideLabel(config, a.rec.lastSide)} last round (side-locked)`,
      });
    } else if (!flipRound) {
      const da = sideDue(a.rec);
      const db = sideDue(b.rec);
      if ((da > 0 && db > 0) || (da < 0 && db < 0)) {
        const due: Side = da > 0 ? "A" : "B";
        terms.push({
          term: "sideConflict",
          cost: w.sideConflict * Math.min(Math.abs(da), Math.abs(db)),
          detail: `both due ${sideLabel(config, due)}`,
        });
      }
    }
  }

  if (method === "random") {
    terms.push({ term: "noise", cost: noiseFor(ea.id, eb.id), detail: "random draw" });
    return terms;
  }

  if (a.group !== b.group) {
    const gap = Math.abs(a.bracketValue - b.bracketValue) || Math.abs(a.group - b.group);
    terms.push({
      term: "bracketGap",
      cost: w.bracketGap * gap * gap,
      detail: `${a.bracketValue}-win vs ${b.bracketValue}-win bracket`,
    });
    return terms;
  }

  const m = a.groupSize;
  let dev: number;
  if (method === "balanced") {
    const half = Math.floor(m / 2);
    dev = Math.min(Math.abs(b.pos - ((a.pos + half) % m)), Math.abs(a.pos - ((b.pos + half) % m)));
  } else if (method === "powermatch" && config.pairing.powermatch === "high_high") {
    dev = Math.abs(b.pos - (a.pos ^ 1));
  } else {
    dev = Math.abs(a.pos + b.pos - (m - 1));
  }
  if (dev > 0)
    terms.push({
      term: "position",
      cost: w.position * dev * dev,
      detail: `${dev} places from ideal`,
    });
  return terms;
}

function sideLabel(config: DebateConfig, s: Side): string {
  return s === "A" ? config.sideLabels[0] : config.sideLabels[1];
}

/** Decide sides for a pair. Returns [side of a, side of b]. */
export function assignSides(
  a: EntryRecord,
  b: EntryRecord,
  config: DebateConfig,
  roundSeq: number,
  rng: Rng,
): [Side, Side] {
  const coin = (): [Side, Side] => (rng.coin() ? ["A", "B"] : ["B", "A"]);
  if (config.sideMethod === "coin_flip") return coin();
  const flipRound = config.sideMethod === "flip" && roundSeq % 2 === 0;
  if (flipRound) {
    if (a.lastSide && a.lastSide === b.lastSide) return coin();
    if (a.lastSide) return [otherSide(a.lastSide), a.lastSide];
    if (b.lastSide) return [b.lastSide, otherSide(b.lastSide)];
    return coin();
  }
  const da = sideDue(a);
  const db = sideDue(b);
  if (da > db) return ["A", "B"];
  if (db > da) return ["B", "A"];
  // Equal due-ness: alternate from last round if possible.
  if (a.lastSide && b.lastSide && a.lastSide !== b.lastSide)
    return [otherSide(a.lastSide), a.lastSide];
  return coin();
}
