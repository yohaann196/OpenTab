import { describe, expect, it } from "vitest";
import {
  assignChambers,
  computeCongressStandings,
  congressAdvancers,
} from "../src/congress/chambers";
import { CONGRESS_PRESET } from "../src/formats/presets";
import { generateTournament } from "../src/simulate";

describe("congress", () => {
  it("spreads schools across chambers", () => {
    const sim = generateTournament({ seed: "cong", entries: 48, schools: 12, teamSize: 1 });
    const chambers = assignChambers(sim.entries, 3, "c");
    expect(chambers.map((c) => c.length).sort()).toEqual([16, 16, 16]);
    const clustering = (cs: typeof chambers) =>
      cs.reduce((acc, c) => {
        const m = new Map<string, number>();
        for (const e of c) m.set(e.schoolId!, (m.get(e.schoolId!) ?? 0) + 1);
        return acc + [...m.values()].reduce((a, n) => a + (n * (n - 1)) / 2, 0);
      }, 0);
    // Round-robin-ish spread by school should beat a naive contiguous split.
    const naive = [sim.entries.slice(0, 16), sim.entries.slice(16, 32), sim.entries.slice(32)];
    expect(clustering(chambers)).toBeLessThanOrEqual(clustering(naive));
  });

  it("ranks by rank total, reciprocals and judge preference", () => {
    const entries = ["a", "b", "c"].map((id) => ({ id, code: id.toUpperCase(), schoolId: id }));
    const members = new Map([["1:ch1", ["a", "b", "c"]]]);
    const ballots = [
      {
        roundSeq: 1,
        chamberId: "ch1",
        judgeId: "j1",
        ranks: [
          { entryId: "a", rank: 1 },
          { entryId: "b", rank: 2 },
        ],
        speeches: [{ entryId: "a", points: 6 }],
      },
      {
        roundSeq: 1,
        chamberId: "ch1",
        judgeId: "j2",
        ranks: [
          { entryId: "b", rank: 1 },
          { entryId: "a", rank: 2 },
        ],
        speeches: [],
      },
      {
        roundSeq: 1,
        chamberId: "ch1",
        judgeId: "j3",
        ranks: [
          { entryId: "a", rank: 1 },
          { entryId: "b", rank: 2 },
          { entryId: "c", rank: 3 },
        ],
        speeches: [],
      },
      {
        roundSeq: 1,
        chamberId: "ch1",
        judgeId: "p",
        parliamentarian: true,
        ranks: [{ entryId: "c", rank: 1 }],
        speeches: [],
      },
    ];
    const st = computeCongressStandings(entries, ballots, CONGRESS_PRESET.tiebreaks, {
      ranksPerBallot: 8,
      chamberMembers: members,
    });
    expect(st.map((r) => r.item.entryId)).toEqual(["a", "b", "c"]);
    expect(st[2]!.item.rankSum).toBe(9 + 9 + 3);
    expect(st[2]!.item.parliRanks).toBe(1);
    expect(congressAdvancers(new Map([["ch1", st.map((r) => r.item)]]), 2)).toEqual(["a", "b"]);
  });
});
