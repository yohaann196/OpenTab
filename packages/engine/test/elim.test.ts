import { describe, expect, it } from "vitest";
import {
  bracketOrder,
  closeoutFindings,
  elimRoundName,
  elimSides,
  nextElimRound,
  seedFirstElimRound,
} from "../src/elim/bracket";
import { roundRobinSchedule, snakePods } from "../src/pairing/roundRobin";
import { Rng } from "../src/rng";

describe("elim brackets", () => {
  it("orders seeds in standard bracket positions", () => {
    expect(bracketOrder(2)).toEqual([1, 2]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(() => bracketOrder(6)).toThrow();
  });

  it("gives byes to top seeds in partial brackets", () => {
    const ids = Array.from({ length: 6 }, (_, i) => `e${i + 1}`);
    const r1 = seedFirstElimRound(ids);
    expect(r1).toHaveLength(4);
    expect(
      r1
        .filter((m) => m.bye)
        .map((m) => m.high.seed)
        .sort(),
    ).toEqual([1, 2]);
    expect(r1.find((m) => m.high.seed === 4)!.low!.seed).toBe(5);
  });

  it("advances winners along the fixed bracket or by reseeding", () => {
    const r1 = seedFirstElimRound(Array.from({ length: 8 }, (_, i) => `e${i + 1}`));
    // Upsets: 8 beats 1, others chalk.
    const winners = r1.map((m) =>
      m.high.seed === 1 ? { ...m.low!, slot: m.slot } : { ...m.high, slot: m.slot },
    );
    const fixed = nextElimRound(winners);
    expect(fixed.map((m) => [m.high.seed, m.low!.seed])).toEqual([
      [4, 8],
      [2, 3],
    ]);
    const reseeded = nextElimRound(winners, true);
    expect(reseeded.map((m) => [m.high.seed, m.low!.seed])).toEqual([
      [2, 8],
      [3, 4],
    ]);
    expect(elimRoundName(8)).toBe("Quarterfinals");
  });

  it("flips sides for rematches and coin-flips otherwise", () => {
    const history = [
      {
        roundId: "r1",
        roundSeq: 1,
        stage: "prelim" as const,
        pairingId: "p",
        sides: [
          { entryId: "x", side: "A" as const },
          { entryId: "y", side: "B" as const },
        ],
        ballots: [],
      },
    ];
    expect(elimSides("x", "y", history, new Rng(1))).toMatchObject({
      sides: ["B", "A"],
      pending: false,
    });
    expect(elimSides("x", "z", history, new Rng(1)).pending).toBe(true);
  });

  it("flags closeouts", () => {
    const f = closeoutFindings(
      [{ slot: 0, high: { entryId: "a", seed: 1 }, low: { entryId: "b", seed: 2 }, bye: false }],
      [
        { id: "a", code: "A", schoolId: "s" },
        { id: "b", code: "B", schoolId: "s" },
      ],
    );
    expect(f[0]!.code).toBe("closeout");
  });
});

describe("round robin", () => {
  it("has everyone meet everyone exactly once", () => {
    for (const n of [4, 5, 6, 7]) {
      const ids = Array.from({ length: n }, (_, i) => `t${i}`);
      const rounds = roundRobinSchedule(ids);
      const met = new Set<string>();
      for (const r of rounds) {
        const inRound = new Set<string>();
        for (const [a, b] of r) {
          expect(inRound.has(a)).toBe(false);
          inRound.add(a);
          if (b) {
            inRound.add(b);
            const k = [a, b].sort().join("-");
            expect(met.has(k)).toBe(false);
            met.add(k);
          }
        }
      }
      expect(met.size).toBe((n * (n - 1)) / 2);
    }
  });
  it("snakes pods", () => {
    expect(snakePods([1, 2, 3, 4, 5, 6], 2)).toEqual([
      [1, 4, 5],
      [2, 3, 6],
    ]);
  });
});
