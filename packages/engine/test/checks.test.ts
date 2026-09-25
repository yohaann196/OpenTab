import { describe, expect, it } from "vitest";
import { checkRound } from "../src/checks";
import { LD_PRESET } from "../src/formats/presets";

describe("checkRound", () => {
  const entries = [
    { id: "a", code: "A", schoolId: "s1" },
    { id: "b", code: "B", schoolId: "s1", requiresAccessible: true },
    { id: "c", code: "C", schoolId: "s2" },
  ];
  const judges = [
    { id: "j1", name: "Judge One", schoolId: "s2" },
    { id: "j2", name: "Judge Two", schoolId: null },
  ];
  const rooms = [{ id: "r1", name: "101" }];
  it("finds the classic disasters", () => {
    const findings = checkRound(
      [
        {
          key: "d1",
          entries: [
            { entryId: "a", side: "A" },
            { entryId: "b", side: "A" },
          ],
          judgeIds: ["j2"],
          roomId: "r1",
          flight: 1,
        },
        {
          key: "d2",
          entries: [
            { entryId: "c", side: "A" },
            { entryId: "a", side: "B" },
          ],
          judgeIds: ["j1", "j2"],
          roomId: "r1",
          flight: 1,
        },
      ],
      {
        entries,
        judges,
        rooms,
        results: [],
        roundSeq: 1,
        config: LD_PRESET,
        judging: LD_PRESET.judging,
        panelSize: 1,
      },
    );
    const codes = findings.map((f) => f.code);
    for (const c of [
      "double_paired",
      "same_school",
      "same_side",
      "inaccessible_room",
      "judge_ineligible",
      "judge_double_booked",
      "room_double_booked",
    ]) {
      expect(codes, c).toContain(c);
    }
  });
  it("is clean for a valid round", () => {
    const findings = checkRound(
      [
        {
          key: "d1",
          entries: [
            { entryId: "a", side: "A" },
            { entryId: "c", side: "B" },
          ],
          judgeIds: ["j2"],
          roomId: "r1",
          flight: 1,
        },
        {
          key: "bye",
          entries: [{ entryId: "b", side: "A" }],
          judgeIds: [],
          roomId: null,
          flight: 1,
          bye: true,
        },
      ],
      {
        entries,
        judges,
        rooms,
        results: [],
        roundSeq: 1,
        config: LD_PRESET,
        judging: LD_PRESET.judging,
        panelSize: 1,
      },
    );
    expect(findings).toEqual([]);
  });
});
