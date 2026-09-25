import { type Db, judge, user } from "@opentab/db";
import { createTestDb } from "@opentab/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Actor,
  addConflict,
  applyEdit,
  createRound,
  createTournament,
  DomainError,
  generateDraft,
  listEvents,
  loadRoundPairings,
  rotateToken,
  saveEntry,
  saveJudge,
  setJudgeBlocks,
} from "../src";

/** A tabber on tournament B must never be able to touch tournament A's data. */
describe("multi-tenant isolation", () => {
  let db: Db;
  let close: () => Promise<void>;
  const alice: Actor = { kind: "user", userId: "alice", name: "Alice" };
  const mallory: Actor = { kind: "user", userId: "mallory", name: "Mallory" };
  let aJudge: string;
  let aEntry: string;
  let bTournament: string;
  let bRound: string;
  let bPairing: string;

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(user).values([
      { id: "alice", name: "Alice", email: "alice@example.com" },
      { id: "mallory", name: "Mallory", email: "mallory@example.com" },
    ]);
    const a = await createTournament(db, alice, {
      name: "Alice Open",
      slug: "alice-open",
      startsOn: "2026-10-01",
      endsOn: "2026-10-01",
      events: [{ format: "ld", name: "LD", abbreviation: "LD" }],
    });
    const aEv = (await listEvents(db, a.id))[0]!;
    aJudge = (await saveJudge(db, alice, a.id, { name: "A Judge" })).id;
    aEntry = (
      await saveEntry(db, alice, a.id, {
        eventId: aEv.id,
        code: "A1",
        name: "A1",
        competitors: [{ name: "Ann" }],
      })
    ).id;

    const b = await createTournament(db, mallory, {
      name: "Mallory Open",
      slug: "mallory-open",
      startsOn: "2026-10-01",
      endsOn: "2026-10-01",
      events: [{ format: "ld", name: "LD", abbreviation: "LD" }],
    });
    bTournament = b.id;
    const bEv = (await listEvents(db, b.id))[0]!;
    for (const code of ["B1", "B2"])
      await saveEntry(db, mallory, b.id, {
        eventId: bEv.id,
        code,
        name: code,
        competitors: [{ name: code }],
      });
    await saveJudge(db, mallory, b.id, { name: "B Judge" });
    bRound = (await createRound(db, mallory, bEv.id, {})).id;
    await generateDraft(db, mallory, bRound, { allocate: false });
    bPairing = (await loadRoundPairings(db, bRound))[0]!.id;
  });
  afterAll(async () => close());

  it("rejects foreign ids in data mutations", async () => {
    await expect(setJudgeBlocks(db, mallory, bTournament, aJudge, [])).rejects.toBeInstanceOf(
      DomainError,
    );
    await expect(
      addConflict(db, mallory, bTournament, { judgeId: aJudge, entryId: aEntry }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(rotateToken(db, mallory, bTournament, "judge", aJudge)).rejects.toBeInstanceOf(
      DomainError,
    );
    // Alice's judge is untouched.
    const [j] = await db.select().from(judge).where(eq(judge.id, aJudge));
    expect(j!.tournamentId).not.toBe(bTournament);
  });

  it("rejects foreign judges and entries in draw edits", async () => {
    await expect(
      applyEdit(db, mallory, bRound, {
        type: "setJudge",
        pairingId: bPairing,
        judgeId: aJudge,
        role: "panelist",
      }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      applyEdit(db, mallory, bRound, { type: "moveEntry", entryId: aEntry, toPairingId: bPairing }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("rejects actors with no role", async () => {
    await expect(
      saveJudge(
        db,
        mallory,
        (await db.query.tournament.findFirst({ where: (t, { eq }) => eq(t.slug, "alice-open") }))!
          .id,
        { name: "x" },
      ),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
