import { type Db, round, user } from "@opentab/db";
import { createTestDb } from "@opentab/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Actor,
  createRound,
  createTournament,
  generateDraft,
  listEvents,
  livePulse,
  MemoryQueue,
  publishDueRounds,
  publishRound,
  saveEntry,
} from "../src";

/** The pieces that let OpenTab run without LISTEN or a background worker. */
describe("serverless mode", () => {
  let db: Db;
  let close: () => Promise<void>;
  let tournamentId: string;
  let roundId: string;
  const owner: Actor = { kind: "user", userId: "owner", name: "Owner" };

  beforeAll(async () => {
    ({ db, close } = await createTestDb());
    await db.insert(user).values({ id: "owner", name: "Owner", email: "owner@example.com" });
    const t = await createTournament(db, owner, {
      name: "Pulse Open",
      slug: "pulse-open",
      startsOn: "2026-10-01",
      endsOn: "2026-10-01",
      events: [{ format: "ld", name: "LD", abbreviation: "LD" }],
    });
    tournamentId = t.id;
    const ev = (await listEvents(db, t.id))[0]!;
    for (const code of ["A", "B", "C", "D"])
      await saveEntry(db, owner, t.id, {
        eventId: ev.id,
        code,
        name: code,
        competitors: [{ name: code }],
      });
    roundId = (await createRound(db, owner, ev.id, {})).id;
    await generateDraft(db, owner, roundId, { allocate: false });
  });
  afterAll(async () => close());

  it("bumps the live cursor on every realtime event", async () => {
    const before = await livePulse(db, tournamentId);
    await publishRound(db, owner, roundId, new MemoryQueue(), {
      at: new Date(Date.now() + 60_000),
      force: true,
    });
    const scheduled = await livePulse(db, tournamentId);
    expect(scheduled.seq).toBe(before.seq); // scheduling alone isn't a public change
    const [r] = await db.select().from(round).where(eq(round.id, roundId));
    expect(r!.status).toBe("draft");
  });

  it("publishes due rounds exactly once, even with concurrent sweeps", async () => {
    const queue = new MemoryQueue();
    expect(await publishDueRounds(db, queue)).toBe(0); // not due yet
    await db
      .update(round)
      .set({ scheduledPublishAt: new Date(Date.now() - 1000) })
      .where(eq(round.id, roundId));
    const before = await livePulse(db, tournamentId);
    const counts = await Promise.all([publishDueRounds(db, queue), publishDueRounds(db, queue)]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    const [r] = await db.select().from(round).where(eq(round.id, roundId));
    expect(r!.status).toBe("published");
    expect(r!.scheduledPublishAt).toBeNull();
    expect(queue.jobs.filter((j) => j.name === "notify.round")).toHaveLength(1);
    const after = await livePulse(db, tournamentId);
    expect(after.seq).toBeGreaterThan(before.seq);
    expect(after.event?.type).toBe("round.published");
  });
});
