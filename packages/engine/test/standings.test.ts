import { describe, expect, it } from "vitest";
import { LD_PRESET, POLICY_PRESET } from "../src/formats/presets";
import { rankItems, sumWithDrop } from "../src/standings/rank";
import { computeSpeakerStandings, computeTeamStandings } from "../src/standings/team";
import type { DebateResult, EntryInfo } from "../src/types";

const E = (id: string, school = id): EntryInfo => ({
  id,
  code: id.toUpperCase(),
  schoolId: school,
});

function debate(
  seq: number,
  a: string,
  b: string,
  winner: string,
  pa: number,
  pb: number,
  judge = "j1",
): DebateResult {
  return {
    roundId: `r${seq}`,
    roundSeq: seq,
    stage: "prelim",
    pairingId: `${seq}-${a}-${b}`,
    sides: [
      { entryId: a, side: "A" },
      { entryId: b, side: "B" },
    ],
    ballots: [
      {
        judgeId: judge,
        winnerId: winner,
        scores: [
          { entryId: a, competitorId: `${a}1`, position: 1, points: pa },
          { entryId: b, competitorId: `${b}1`, position: 1, points: pb },
        ],
      },
    ],
  };
}

describe("sumWithDrop", () => {
  it("drops high/low values", () => {
    expect(sumWithDrop([27, 28, 29, 30])).toBe(114);
    expect(sumWithDrop([27, 28, 29, 30], { mode: "highlow", count: 1 })).toBe(57);
    expect(sumWithDrop([27, 28, 29, 30], { mode: "low", count: 2 })).toBe(59);
    expect(sumWithDrop([27, 28, 29, 30], { mode: "high", count: 1 })).toBe(84);
    expect(sumWithDrop([27], { mode: "highlow", count: 1 })).toBe(0);
  });
});

describe("rankItems", () => {
  it("splits groups in order and applies pairwise criteria only to pairs", () => {
    const items = [
      { id: "a", w: 2, p: 10 },
      { id: "b", w: 2, p: 10 },
      { id: "c", w: 3, p: 1 },
      { id: "d", w: 1, p: 1 },
    ];
    const ranked = rankItems(items, [
      { id: "w", label: "Wins", direction: "desc", value: (x) => x.w },
      { id: "p", label: "Points", direction: "desc", value: (x) => x.p },
      { id: "h2h", label: "H2H", compare: (x, y) => (x.id === "b" ? -1 : y.id === "b" ? 1 : 0) },
    ]);
    expect(ranked.map((r) => r.item.id)).toEqual(["c", "b", "a", "d"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
    expect(ranked[2]!.separatedBy).toBe("H2H");
  });
  it("shares ranks for complete ties", () => {
    const ranked = rankItems(
      [{ v: 1 }, { v: 1 }, { v: 0 }],
      [{ id: "v", label: "V", direction: "desc", value: (x) => x.v }],
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 3]);
  });
});

describe("computeTeamStandings", () => {
  const entries = ["a", "b", "c", "d"].map((x) => E(x));
  const results = [
    debate(1, "a", "b", "a", 29, 28),
    debate(1, "c", "d", "c", 28.5, 28),
    debate(2, "a", "c", "a", 29.5, 29, "j2"),
    debate(2, "b", "d", "d", 27, 28.8, "j2"),
  ];
  it("orders by wins then points with explanations", () => {
    const st = computeTeamStandings(entries, results, LD_PRESET.tiebreaks, { seed: "t" });
    expect(st.rows.map((r) => r.item.entryId)).toEqual(["a", "c", "d", "b"]);
    expect(st.rows[0]!.item.wins).toBe(2);
    expect(st.rows[2]!.explanation).toMatch(/Below C on Speaker points/);
    expect(st.rows[3]!.explanation).toMatch(/Below D on Wins: 0 vs 1/);
  });
  it("counts byes as wins with averaged points", () => {
    const bye: DebateResult = {
      roundId: "r3",
      roundSeq: 3,
      stage: "prelim",
      pairingId: "bye",
      sides: [{ entryId: "b", side: "A" }],
      bye: true,
      ballots: [],
    };
    const st = computeTeamStandings(
      entries,
      [...results, bye],
      [{ key: "wins" }, { key: "points" }],
    );
    const b = st.rows.find((r) => r.item.entryId === "b")!;
    expect(b.item.wins).toBe(1);
    expect(b.item.points).toBeCloseTo(28 + 27 + 27.5, 5);
  });
  it("supports opp wins, point differential, ranks and head-to-head", () => {
    const st = computeTeamStandings(
      entries,
      results,
      [
        { key: "wins" },
        { key: "opp_wins" },
        { key: "point_diff" },
        { key: "head_to_head" },
        { key: "coinflip" },
      ],
      { seed: "x" },
    );
    expect(st.rows).toHaveLength(4);
    const policy = computeTeamStandings(entries, results, POLICY_PRESET.tiebreaks);
    expect(policy.rows).toHaveLength(4);
  });
});

describe("computeSpeakerStandings", () => {
  it("ranks speakers by points", () => {
    const entries = ["a", "b"].map((x) => E(x));
    const comps = [
      { id: "a1", entryId: "a", name: "Ann" },
      { id: "b1", entryId: "b", name: "Bo" },
    ];
    const st = computeSpeakerStandings(
      comps,
      entries,
      [debate(1, "a", "b", "a", 29, 28)],
      [{ key: "points" }],
    );
    expect(st.map((r) => r.item.name)).toEqual(["Ann", "Bo"]);
    expect(st[0]!.item.total).toBe(29);
  });
});
