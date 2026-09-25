import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { maxWeightMatching, minCostPerfectMatching } from "../src/optim/blossom";
import { solveAssignment } from "../src/optim/hungarian";
import { MinCostFlow } from "../src/optim/minCostFlow";

/** Brute-force minimum-cost perfect matching for small n. */
function bruteMinPerfect(n: number, cost: (i: number, j: number) => number): number {
  let best = Number.POSITIVE_INFINITY;
  const used = new Array<boolean>(n).fill(false);
  const rec = (acc: number): void => {
    const i = used.indexOf(false);
    if (i === -1) {
      best = Math.min(best, acc);
      return;
    }
    used[i] = true;
    for (let j = i + 1; j < n; j++) {
      if (used[j]) continue;
      used[j] = true;
      rec(acc + cost(i, j));
      used[j] = false;
    }
    used[i] = false;
  };
  rec(0);
  return best;
}

function bruteMaxWeight(n: number, edges: [number, number, number][]): number {
  let best = 0;
  const rec = (k: number, used: Set<number>, acc: number): void => {
    if (k === edges.length) {
      best = Math.max(best, acc);
      return;
    }
    rec(k + 1, used, acc);
    const [i, j, w] = edges[k]!;
    if (!used.has(i) && !used.has(j)) {
      used.add(i);
      used.add(j);
      rec(k + 1, used, acc + w);
      used.delete(i);
      used.delete(j);
    }
  };
  rec(0, new Set(), 0);
  void n;
  return best;
}

describe("maxWeightMatching", () => {
  it("handles trivial graphs", () => {
    expect(maxWeightMatching([])).toEqual([]);
    expect(maxWeightMatching([[0, 1, 1]])).toEqual([1, 0]);
    expect(
      maxWeightMatching([
        [1, 2, 10],
        [2, 3, 11],
      ]),
    ).toEqual([-1, -1, 3, 2]);
  });

  it("solves classic blossom cases", () => {
    // Create an S-blossom and use it for augmentation.
    expect(
      maxWeightMatching([
        [1, 2, 8],
        [1, 3, 9],
        [2, 3, 10],
        [3, 4, 7],
      ]),
    ).toEqual([-1, 2, 1, 4, 3]);
    expect(
      maxWeightMatching([
        [1, 2, 8],
        [1, 3, 9],
        [2, 3, 10],
        [3, 4, 7],
        [1, 6, 5],
        [4, 5, 6],
      ]),
    ).toEqual([-1, 6, 3, 2, 5, 4, 1]);
    // Create nested S-blossom, relabel as T, expand.
    expect(
      maxWeightMatching([
        [1, 2, 19],
        [1, 3, 20],
        [1, 8, 8],
        [2, 3, 25],
        [2, 4, 18],
        [3, 5, 18],
        [4, 5, 13],
        [4, 7, 7],
        [5, 6, 7],
      ]),
    ).toEqual([-1, 8, 3, 2, 7, 6, 5, 4, 1]);
    // Create blossom, relabel as T in more than one way, expand, augment.
    expect(
      maxWeightMatching([
        [1, 2, 45],
        [1, 5, 45],
        [2, 3, 50],
        [3, 4, 45],
        [4, 5, 50],
        [1, 6, 30],
        [3, 9, 35],
        [4, 8, 35],
        [5, 7, 26],
        [9, 10, 5],
      ]),
    ).toEqual([-1, 6, 3, 2, 8, 7, 1, 5, 4, 10, 9]);
    // Nested blossom expansion with least-slack edge.
    expect(
      maxWeightMatching([
        [1, 2, 40],
        [1, 3, 40],
        [2, 3, 60],
        [2, 4, 55],
        [3, 5, 55],
        [4, 5, 50],
        [1, 8, 15],
        [5, 7, 30],
        [7, 6, 10],
        [8, 10, 10],
        [4, 9, 30],
      ]),
    ).toEqual([-1, 2, 1, 5, 9, 3, 7, 6, 10, 4, 8]);
  });

  it("matches brute force on random small graphs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 8 }),
        fc.array(fc.tuple(fc.nat(7), fc.nat(7), fc.integer({ min: 1, max: 30 })), {
          maxLength: 14,
        }),
        (n, raw) => {
          const seen = new Set<string>();
          const edges: [number, number, number][] = [];
          for (const [a, b, w] of raw) {
            const i = a % n;
            const j = b % n;
            if (i === j) continue;
            const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            edges.push([i, j, w]);
          }
          const mate = maxWeightMatching(edges);
          let total = 0;
          for (const [i, j, w] of edges) if (mate[i] === j) total += w;
          for (let v = 0; v < mate.length; v++) if (mate[v]! >= 0) expect(mate[mate[v]!]).toBe(v);
          expect(total).toBe(bruteMaxWeight(n, edges));
        },
      ),
      { numRuns: 300 },
    );
  });
});

describe("minCostPerfectMatching", () => {
  it("equals brute-force optimum on random complete graphs", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 5 }).map((h) => h * 2),
        fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 45, maxLength: 45 }),
        (n, weights) => {
          const cost = (i: number, j: number) => weights[(i * 7 + j * 3) % 45]!;
          const pairs = minCostPerfectMatching(n, cost);
          expect(pairs).toHaveLength(n / 2);
          const total = pairs.reduce((s, [i, j]) => s + cost(i, j), 0);
          expect(total).toBe(bruteMinPerfect(n, cost));
        },
      ),
      { numRuns: 200 },
    );
  });

  it("handles 300 vertices quickly", () => {
    const n = 300;
    const t0 = performance.now();
    const pairs = minCostPerfectMatching(n, (i, j) => ((i * 31 + j * 17) % 97) + Math.abs(i - j));
    expect(pairs).toHaveLength(150);
    expect(performance.now() - t0).toBeLessThan(5000);
  });
});

describe("solveAssignment", () => {
  it("finds optimal square assignment", () => {
    const c = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    expect(solveAssignment(c)).toEqual([1, 0, 2]);
  });
  it("handles rectangular and forbidden cells", () => {
    const I = Number.POSITIVE_INFINITY;
    expect(
      solveAssignment([
        [I, 5, 1],
        [2, I, I],
      ]),
    ).toEqual([2, 0]);
    expect(solveAssignment([[1], [0], [5]])).toEqual([-1, 0, -1]);
  });
});

describe("MinCostFlow", () => {
  it("routes flow at minimum cost", () => {
    const f = new MinCostFlow(4);
    f.addEdge(0, 1, 2, 1);
    f.addEdge(0, 2, 1, 5);
    const a = f.addEdge(1, 3, 1, 1);
    const b = f.addEdge(1, 2, 1, 1);
    f.addEdge(2, 3, 2, 1);
    const r = f.run(0, 3);
    expect(r.flow).toBe(3);
    expect(r.cost).toBe(1 + 1 + 1 + 1 + 1 + 5 + 1);
    expect(f.flowOn(a)).toBe(1);
    expect(f.flowOn(b)).toBe(1);
  });
});
