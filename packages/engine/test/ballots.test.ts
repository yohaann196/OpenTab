import { describe, expect, it } from "vitest";
import { validateCongressBallot, validateTwoTeamBallot } from "../src/ballots/validate";
import { CONGRESS_PRESET, LD_PRESET, POLICY_PRESET, WSDC_PRESET } from "../src/formats/presets";

const ldDebate = {
  entries: [
    { entryId: "a", side: "A" as const },
    { entryId: "b", side: "B" as const },
  ],
  competitors: { a: ["a1"], b: ["b1"] },
};

describe("two-team ballots", () => {
  it("accepts a clean LD ballot", () => {
    const v = validateTwoTeamBallot(
      {
        winnerId: "a",
        scores: [
          { entryId: "a", competitorId: "a1", position: 1, points: 29.1 },
          { entryId: "b", competitorId: "b1", position: 1, points: 28.5 },
        ],
      },
      ldDebate,
      LD_PRESET,
    );
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    expect(v.totals).toEqual({ a: 29.1, b: 28.5 });
  });

  it("rejects out-of-range and off-step points, warns on low-point wins", () => {
    const bad = validateTwoTeamBallot(
      {
        winnerId: "a",
        scores: [
          { entryId: "a", competitorId: "a1", position: 1, points: 31 },
          { entryId: "b", competitorId: "b1", position: 1, points: 28.55 },
        ],
      },
      ldDebate,
      LD_PRESET,
    );
    expect(bad.errors.map((e) => e.code)).toEqual(["points_range", "points_step"]);
    const lpw = validateTwoTeamBallot(
      {
        winnerId: "a",
        scores: [
          { entryId: "a", competitorId: "a1", position: 1, points: 28 },
          { entryId: "b", competitorId: "b1", position: 1, points: 29 },
        ],
      },
      ldDebate,
      LD_PRESET,
    );
    expect(lpw.errors).toEqual([]);
    expect(lpw.warnings[0]!.code).toBe("low_point_win");
  });

  it("requires unique speaker ranks in policy", () => {
    const debate = {
      entries: ldDebate.entries,
      competitors: { a: ["a1", "a2"], b: ["b1", "b2"] },
    };
    const v = validateTwoTeamBallot(
      {
        winnerId: "a",
        scores: [
          { entryId: "a", competitorId: "a1", position: 1, points: 29, rank: 1 },
          { entryId: "a", competitorId: "a2", position: 2, points: 28.5, rank: 1 },
          { entryId: "b", competitorId: "b1", position: 1, points: 28.4, rank: 3 },
          { entryId: "b", competitorId: "b2", position: 2, points: 28.2, rank: 4 },
        ],
      },
      debate,
      POLICY_PRESET,
    );
    expect(v.errors.map((e) => e.code)).toContain("ranks");
  });

  it("validates World Schools components and forbids low-point wins", () => {
    const debate = {
      entries: ldDebate.entries,
      competitors: { a: ["a1", "a2", "a3"], b: ["b1", "b2", "b3"] },
    };
    const speaker = (
      entryId: string,
      n: number,
      s: number,
      c: number,
      t: number,
      reply = false,
    ) => ({
      entryId,
      competitorId: `${entryId}${n}`,
      position: reply ? 4 : n,
      reply,
      points: s + c + t,
      components: { style: s, content: c, strategy: t },
    });
    const good = validateTwoTeamBallot(
      {
        winnerId: "a",
        scores: [
          speaker("a", 1, 28, 28, 14),
          speaker("a", 2, 28, 28, 14),
          speaker("a", 3, 28, 28, 14),
          speaker("a", 1, 14, 14, 7, true),
          speaker("b", 1, 27, 27, 13.5),
          speaker("b", 2, 27, 27, 13.5),
          speaker("b", 3, 27, 27, 13.5),
          speaker("b", 2, 13.5, 13.5, 7, true),
        ],
      },
      debate,
      WSDC_PRESET,
    );
    expect(good.errors).toEqual([]);
    const lpw = validateTwoTeamBallot(
      {
        winnerId: "b",
        scores: [
          speaker("a", 1, 28, 28, 14),
          speaker("a", 2, 28, 28, 14),
          speaker("a", 3, 28, 28, 14),
          speaker("a", 1, 14, 14, 7, true),
          speaker("b", 1, 27, 27, 13.5),
          speaker("b", 2, 27, 27, 13.5),
          speaker("b", 3, 40, 27, 13.5),
          speaker("b", 3, 13.5, 13.5, 7, true),
        ],
      },
      debate,
      WSDC_PRESET,
    );
    const codes = lpw.errors.map((e) => e.code);
    expect(codes).toContain("component_range");
    expect(codes).toContain("reply_speaker");
  });
});

describe("congress ballots", () => {
  it("checks points and ranks", () => {
    const ok = validateCongressBallot(
      {
        speeches: [
          { entryId: "a", points: 5 },
          { entryId: "b", points: 4 },
        ],
        ranks: [
          { entryId: "a", rank: 1 },
          { entryId: "b", rank: 2 },
        ],
      },
      ["a", "b"],
      CONGRESS_PRESET,
    );
    expect(ok.errors).toEqual([]);
    const bad = validateCongressBallot(
      {
        speeches: [{ entryId: "a", points: 9 }],
        ranks: [
          { entryId: "a", rank: 1 },
          { entryId: "b", rank: 1 },
        ],
      },
      ["a", "b"],
      CONGRESS_PRESET,
    );
    expect(bad.errors.map((e) => e.code)).toEqual(
      expect.arrayContaining(["speech_points", "rank_tie"]),
    );
  });
});
