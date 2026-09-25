import { describe, expect, it } from "vitest";
import { allocateJudges, judgeEligibility, type PanelSlot } from "../src/allocation/judges";
import { normalisePrefs, ordinalsToPercentiles, validatePrefSheet } from "../src/allocation/prefs";
import { allocateRooms } from "../src/allocation/rooms";
import { LD_PRESET, POLICY_PRESET } from "../src/formats/presets";
import { pairTwoTeamRound } from "../src/pairing/twoTeam";
import { generateTournament } from "../src/simulate";
import type { EntryInfo, JudgeInfo, RoomInfo } from "../src/types";

const entries: EntryInfo[] = [
  { id: "a", code: "A", schoolId: "s1" },
  { id: "b", code: "B", schoolId: "s2" },
  { id: "c", code: "C", schoolId: "s3" },
  { id: "d", code: "D", schoolId: "s4" },
];

describe("judge eligibility", () => {
  const settings = LD_PRESET.judging;
  it("blocks conflicts, strikes, same school and owed ballots", () => {
    const base: JudgeInfo = { id: "j", name: "J", schoolId: "s9" };
    const ctx = { entries, settings };
    expect(judgeEligibility(base, ["a", "b"], ctx).ok).toBe(true);
    expect(judgeEligibility({ ...base, schoolId: "s1" }, ["a", "b"], ctx)).toMatchObject({
      ok: false,
    });
    expect(judgeEligibility({ ...base, conflictEntryIds: ["b"] }, ["a", "b"], ctx)).toMatchObject({
      ok: false,
    });
    expect(
      judgeEligibility({ ...base, hasOutstandingBallot: true }, ["a", "b"], ctx),
    ).toMatchObject({ ok: false });
    expect(judgeEligibility({ ...base, available: false }, ["a", "b"], ctx)).toMatchObject({
      ok: false,
    });
    const prefs = new Map([["a", new Map([["j", "strike" as const]])]]);
    expect(judgeEligibility(base, ["a", "b"], { ...ctx, prefs })).toMatchObject({ ok: false });
  });
});

describe("allocateJudges", () => {
  it("fills panels without violating hard constraints", () => {
    const sim = generateTournament({ seed: "alloc", entries: 60, judges: 45 });
    const pairing = pairTwoTeamRound({
      entries: sim.entries,
      results: [],
      roundSeq: 1,
      config: LD_PRESET,
      seed: "x",
    });
    const panels: PanelSlot[] = pairing.debates
      .filter((d) => !d.bye)
      .map((d, i) => ({
        key: d.key,
        entryIds: d.entries.map((e) => e.entryId),
        flight: 1,
        importance: i / 30,
        size: 1,
      }));
    const out = allocateJudges({
      panels,
      judges: sim.judges,
      entries: sim.entries,
      settings: LD_PRESET.judging,
    });
    const used = new Set<string>();
    for (const a of out.assignments) {
      expect(a.judges).toHaveLength(1);
      for (const j of a.judges) {
        expect(used.has(j.judgeId)).toBe(false);
        used.add(j.judgeId);
        const judge = sim.judges.find((x) => x.id === j.judgeId)!;
        const p = panels.find((x) => x.key === a.panelKey)!;
        expect(
          judgeEligibility(judge, p.entryIds, { entries: sim.entries, settings: LD_PRESET.judging })
            .ok,
        ).toBe(true);
      }
    }
    expect(out.findings.filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("places mutually preferred judges when prefs are on", () => {
    const judges: JudgeInfo[] = [
      { id: "good", name: "Good", schoolId: null, rating: 5 },
      { id: "lopsided", name: "Lopsided", schoolId: null, rating: 5 },
    ];
    const prefs = new Map([
      [
        "a",
        new Map<string, number | "strike">([
          ["good", 10],
          ["lopsided", 1],
        ]),
      ],
      [
        "b",
        new Map<string, number | "strike">([
          ["good", 10],
          ["lopsided", 90],
        ]),
      ],
    ]);
    const out = allocateJudges({
      panels: [{ key: "p", entryIds: ["a", "b"], flight: 1, importance: 0.5, size: 1 }],
      judges,
      entries,
      prefs,
      settings: POLICY_PRESET.judging,
    });
    expect(out.assignments[0]!.judges[0]!.judgeId).toBe("good");
  });

  it("lets one judge cover both flights but never two panels in one flight", () => {
    const out = allocateJudges({
      panels: [
        { key: "f1", entryIds: ["a", "b"], flight: 1, importance: 0, size: 1 },
        { key: "f2", entryIds: ["c", "d"], flight: 2, importance: 0, size: 1 },
        { key: "f1b", entryIds: ["c", "d"], flight: 1, importance: 0, size: 1 },
      ],
      judges: [{ id: "only", name: "Only", schoolId: null }],
      entries,
      settings: LD_PRESET.judging,
    });
    const placed = out.assignments.filter((a) => a.judges.length > 0).map((a) => a.panelKey);
    expect(placed).toHaveLength(2);
    expect(placed).toContain("f2");
    expect(out.findings.some((f) => f.code === "underfilled_panel")).toBe(true);
  });

  it("chooses the highest-rated judge as chair on a panel of three", () => {
    const judges: JudgeInfo[] = [1, 9, 5].map((r, i) => ({
      id: `j${i}`,
      name: `J${i}`,
      schoolId: null,
      rating: r,
    }));
    const out = allocateJudges({
      panels: [{ key: "p", entryIds: ["a", "b"], flight: 1, importance: 1, size: 3 }],
      judges,
      entries,
      settings: LD_PRESET.judging,
    });
    expect(out.assignments[0]!.judges[0]).toMatchObject({ judgeId: "j1", role: "chair" });
  });
});

describe("prefs", () => {
  it("converts ordinals to obligation-weighted percentiles", () => {
    const pct = ordinalsToPercentiles(
      [
        { judgeId: "x", ordinal: 1 },
        { judgeId: "y", ordinal: 2 },
        { judgeId: "z", ordinal: 3, strike: true },
      ],
      new Map([
        ["x", 3],
        ["y", 1],
      ]),
    );
    expect(pct.get("x")).toBe(37.5);
    expect(pct.get("y")).toBe(87.5);
    expect(pct.get("z")).toBe("strike");
  });

  it("validates tier quotas and strikes", () => {
    const settings = {
      ...POLICY_PRESET.judging,
      prefs: "tiers" as const,
      strikes: 1,
      tiers: [
        { name: "1", minPct: 50, maxPct: 50 },
        { name: "2", minPct: 50, maxPct: 50 },
      ],
    };
    const ok = validatePrefSheet(
      [
        { judgeId: "a", tier: 1 },
        { judgeId: "b", tier: 2 },
      ],
      ["a", "b"],
      settings,
    );
    expect(ok).toHaveLength(0);
    const bad = validatePrefSheet(
      [
        { judgeId: "a", tier: 1 },
        { judgeId: "b", tier: 1, strike: true },
        { judgeId: "c", strike: true },
      ],
      ["a", "b", "c"],
      settings,
    );
    expect(bad.map((f) => f.code)).toContain("too_many_strikes");
    expect(normalisePrefs([{ judgeId: "a", tier: 1 }], settings, new Map()).get("a")).toBe(25);
  });
});

describe("allocateRooms", () => {
  const rooms: RoomInfo[] = [
    { id: "r1", name: "Best", priority: 3 },
    { id: "r2", name: "Mid", priority: 2, accessible: true },
    { id: "r3", name: "Worst", priority: 1 },
  ];
  it("gives top debates the best rooms and honours accessibility", () => {
    const out = allocateRooms(
      [
        { key: "top", flight: 1, importance: 1 },
        { key: "low", flight: 1, importance: 0 },
        { key: "acc", flight: 1, importance: 0.1, requiresAccessible: true },
      ],
      rooms,
    );
    expect(out.assignments.get("top")).toBe("r1");
    expect(out.assignments.get("acc")).toBe("r2");
    expect(out.assignments.get("low")).toBe("r3");
  });
  it("reports shortages and keeps preferred rooms", () => {
    const out = allocateRooms(
      [
        { key: "a", flight: 1, importance: 1, preferredRoomId: "r3" },
        { key: "b", flight: 1, importance: 0, requiresAccessible: true },
        { key: "c", flight: 1, importance: 0, requiresAccessible: true },
      ],
      rooms,
    );
    expect(out.assignments.get("a")).toBe("r3");
    expect(out.findings.some((f) => f.code === "no_accessible_room")).toBe(true);
  });
});
