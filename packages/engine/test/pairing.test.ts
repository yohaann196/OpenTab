import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { LD_PRESET, PF_PRESET, POLICY_PRESET } from "../src/formats/presets";
import type { DebateConfig } from "../src/formats/schemas";
import { buildRecords } from "../src/pairing/records";
import { pairTwoTeamRound } from "../src/pairing/twoTeam";
import { Rng } from "../src/rng";
import { generateTournament, simulateDebate } from "../src/simulate";
import type { DebateResult, EntryInfo } from "../src/types";

function runTournament(config: DebateConfig, n: number, rounds: number, seed: string) {
  const sim = generateTournament({ seed, entries: n, teamSize: config.teamSize });
  const results: DebateResult[] = [];
  const rng = new Rng(`${seed}-results`);
  const outputs = [];
  for (let r = 1; r <= rounds; r++) {
    const out = pairTwoTeamRound({
      entries: sim.entries,
      results,
      roundSeq: r,
      config,
      seed: `${seed}-r${r}`,
    });
    outputs.push(out);
    for (const d of out.debates) {
      results.push(
        simulateDebate(
          {
            roundId: `r${r}`,
            roundSeq: r,
            stage: "prelim",
            pairingId: `r${r}-${d.key}`,
            entries: d.entries,
            judgeIds: [`j-${r}-${d.key}`],
            bye: d.bye,
            pulledUpIds: d.pulledUpIds,
          },
          sim,
          config,
          rng,
        ),
      );
    }
  }
  return { sim, results, outputs };
}

function assertEveryonePaired(entries: EntryInfo[], debates: { entries: { entryId: string }[] }[]) {
  const seen = new Map<string, number>();
  for (const d of debates)
    for (const e of d.entries) seen.set(e.entryId, (seen.get(e.entryId) ?? 0) + 1);
  for (const e of entries) expect(seen.get(e.id), `entry ${e.code}`).toBe(1);
  expect(seen.size).toBe(entries.length);
}

describe("pairTwoTeamRound", () => {
  it("pairs every entry exactly once, with a bye for odd fields", () => {
    for (const n of [2, 3, 10, 11, 37, 64]) {
      const sim = generateTournament({ seed: `n${n}`, entries: n });
      const out = pairTwoTeamRound({
        entries: sim.entries,
        results: [],
        roundSeq: 1,
        config: LD_PRESET,
        seed: "x",
      });
      assertEveryonePaired(sim.entries, out.debates);
      expect(out.debates.filter((d) => d.bye)).toHaveLength(n % 2);
    }
  });

  it("is deterministic for a given seed", () => {
    const sim = generateTournament({ seed: "det", entries: 40 });
    const a = pairTwoTeamRound({
      entries: sim.entries,
      results: [],
      roundSeq: 1,
      config: LD_PRESET,
      seed: "s",
    });
    const b = pairTwoTeamRound({
      entries: sim.entries,
      results: [],
      roundSeq: 1,
      config: LD_PRESET,
      seed: "s",
    });
    expect(a.debates.map((d) => d.key)).toEqual(b.debates.map((d) => d.key));
    const c = pairTwoTeamRound({
      entries: sim.entries,
      results: [],
      roundSeq: 1,
      config: LD_PRESET,
      seed: "t",
    });
    expect(c.debates.map((d) => d.key)).not.toEqual(a.debates.map((d) => d.key));
  });

  it("never produces same-school or repeat debates when avoidable over a full tournament", () => {
    for (const [config, n] of [
      [LD_PRESET, 60],
      [POLICY_PRESET, 41],
      [PF_PRESET, 90],
    ] as const) {
      const { outputs } = runTournament(
        config,
        n,
        config.prelimRounds,
        `full-${config.format}-${n}`,
      );
      for (const out of outputs) {
        const bad = out.findings.filter((f) => f.code === "same_school" || f.code === "rematch");
        expect(bad, JSON.stringify(bad)).toHaveLength(0);
      }
    }
  });

  it("keeps side-locked formats balanced (flip rounds)", () => {
    const { sim, results } = runTournament(LD_PRESET, 50, 6, "sides");
    const recs = buildRecords(sim.entries, results);
    let imbalanced = 0;
    for (const r of recs.values()) {
      const diff = Math.abs(r.sideCounts.A - r.sideCounts.B);
      if (diff > (r.byes > 0 ? 1 : 0)) imbalanced++;
    }
    // With side locks every even round, all entries should be 3-3 (or 3-2 with a bye).
    expect(imbalanced).toBe(0);
  });

  it("power-matches within brackets (almost all debates are same-record)", () => {
    const { outputs, results, sim } = runTournament(LD_PRESET, 64, 4, "brackets");
    const r4 = outputs[3]!;
    const recs = buildRecords(
      sim.entries,
      results.filter((d) => d.roundSeq < 4),
    );
    let cross = 0;
    for (const d of r4.debates) {
      if (d.bye) continue;
      const [a, b] = d.entries.map((e) => recs.get(e.entryId)!.wins);
      if (a !== b) cross++;
    }
    // Odd brackets force a few pull-ups, but nowhere near most debates.
    expect(cross).toBeLessThanOrEqual(4);
  });

  it("pairs high-low inside a bracket", () => {
    // 8 entries, all 0 wins: in a powermatch round, positions 0v7, 1v6, 2v5, 3v4.
    const entries: EntryInfo[] = Array.from({ length: 8 }, (_, i) => ({
      id: `e${i}`,
      code: `E${i}`,
      schoolId: `s${i}`,
      seed: i + 1,
    }));
    const out = pairTwoTeamRound({
      entries,
      results: [],
      roundSeq: 3,
      config: {
        ...LD_PRESET,
        pairing: { ...LD_PRESET.pairing, presetRounds: 0, presetMethod: "protected" },
      },
      method: "protected",
      seed: "hl",
    });
    const pairs = out.debates
      .map((d) =>
        d.entries
          .map((e) => e.entryId)
          .sort()
          .join("-"),
      )
      .sort();
    expect(pairs).toEqual(["e0-e7", "e1-e6", "e2-e5", "e3-e4"]);
  });

  it("respects locked debates", () => {
    const sim = generateTournament({ seed: "lock", entries: 12 });
    const [a, b] = [sim.entries[0]!, sim.entries[1]!];
    const out = pairTwoTeamRound({
      entries: sim.entries,
      results: [],
      roundSeq: 1,
      config: LD_PRESET,
      seed: "l",
      locked: [{ entryIds: [a.id, b.id], sides: ["B", "A"] }],
    });
    assertEveryonePaired(sim.entries, out.debates);
    const locked = out.debates.find((d) => d.locked)!;
    expect(locked.entries).toEqual([
      { entryId: a.id, side: "B" },
      { entryId: b.id, side: "A" },
    ]);
  });

  it("property: valid pairing for random fields and rounds", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 40 }),
        fc.integer({ min: 1, max: 5 }),
        fc.string(),
        (n, rounds, seed) => {
          const { sim, outputs } = runTournament(LD_PRESET, n, rounds, `p-${seed}`);
          for (const out of outputs) assertEveryonePaired(sim.entries, out.debates);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("marks PF sides as pending coin flips", () => {
    const sim = generateTournament({ seed: "pf", entries: 10 });
    const out = pairTwoTeamRound({
      entries: sim.entries,
      results: [],
      roundSeq: 1,
      config: PF_PRESET,
      seed: "pf",
    });
    expect(out.debates.every((d) => d.bye || d.sidesPending)).toBe(true);
  });
});
