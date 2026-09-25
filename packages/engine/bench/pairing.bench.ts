/**
 * Benchmark: power-match + judge placement + rooms for large fields.
 * Run: pnpm --filter @opentab/engine bench
 */
import { allocateJudges } from "../src/allocation/judges";
import { allocateRooms } from "../src/allocation/rooms";
import { POLICY_PRESET } from "../src/formats/presets";
import { pairTwoTeamRound } from "../src/pairing/twoTeam";
import { Rng } from "../src/rng";
import { generateTournament, simulateDebate } from "../src/simulate";
import type { DebateResult } from "../src/types";

for (const n of [100, 300, 500]) {
  const sim = generateTournament({ seed: `bench-${n}`, entries: n });
  const results: DebateResult[] = [];
  const rng = new Rng(1);
  const timings: number[] = [];
  for (let r = 1; r <= 6; r++) {
    const t0 = performance.now();
    const pairing = pairTwoTeamRound({
      entries: sim.entries,
      results,
      roundSeq: r,
      config: POLICY_PRESET,
      seed: `r${r}`,
    });
    const panels = pairing.debates
      .filter((d) => !d.bye)
      .map((d, i, arr) => ({
        key: d.key,
        entryIds: d.entries.map((e) => e.entryId),
        flight: 1,
        importance: 1 - i / arr.length,
        size: 1,
      }));
    const judges = allocateJudges({
      panels,
      judges: sim.judges,
      entries: sim.entries,
      settings: { ...POLICY_PRESET.judging, prefs: "none" },
    });
    allocateRooms(
      panels.map((p) => ({ key: p.key, flight: 1, importance: p.importance })),
      sim.rooms,
    );
    timings.push(performance.now() - t0);
    for (const d of pairing.debates) {
      const js =
        judges.assignments.find((a) => a.panelKey === d.key)?.judges.map((j) => j.judgeId) ?? [];
      results.push(
        simulateDebate(
          {
            roundId: `r${r}`,
            roundSeq: r,
            stage: "prelim",
            pairingId: `${r}${d.key}`,
            entries: d.entries,
            judgeIds: js,
            bye: d.bye,
          },
          sim,
          POLICY_PRESET,
          rng,
        ),
      );
    }
  }
  const max = Math.max(...timings);
  console.log(
    `${n} entries: max ${max.toFixed(0)} ms / round (pair + judges + rooms); rounds: ${timings.map((t) => t.toFixed(0)).join(", ")}`,
  );
}
