import { type Db, entry, judge, room, school, user } from "@opentab/db";
import { createTestDb } from "@opentab/db/testing";
import { type DebateConfig, generateTournament, Rng, simulateDebate } from "@opentab/engine";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Actor,
  addFollow,
  addSpeech,
  applyEdit,
  ballotBoard,
  buildBracket,
  checkRoundDraft,
  commitImport,
  computeStandings,
  createBreak,
  createRound,
  createTournament,
  currentPairings,
  DomainError,
  ensureTokens,
  findInPairings,
  generateDraft,
  getBallotContext,
  getPrefSheet,
  guessMapping,
  judgeAssignments,
  listEvents,
  loadRoundPairings,
  MemoryQueue,
  parseCsv,
  planRoundNotifications,
  precedenceQueue,
  previewImport,
  publishedStandings,
  publishRound,
  publishStandings,
  resolveToken,
  saveBallot,
  savePrefSheet,
  setMember,
  tokenActor,
  tokenFor,
  unpublishRound,
} from "../src";

let db: Db;
let close: () => Promise<void>;
const owner: Actor = { kind: "user", userId: "u-owner", name: "Owner" };
const stranger: Actor = { kind: "user", userId: "u-stranger", name: "Stranger" };
const queue = new MemoryQueue();

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(user).values([
    { id: "u-owner", name: "Owner", email: "owner@example.com" },
    { id: "u-stranger", name: "Stranger", email: "stranger@example.com" },
    { id: "u-tab", name: "Tabber", email: "tab@example.com" },
  ]);
});
afterAll(async () => close());

/** Submits simulated ballots for every published pairing of a round. */
async function submitRound(roundId: string, config: DebateConfig, seed: string) {
  const pairings = await loadRoundPairings(db, roundId);
  const rng = new Rng(seed);
  for (const p of pairings) {
    if (p.bye) continue;
    const ctxs = await Promise.all(
      p.judges
        .filter((j) => j.role !== "trainee")
        .map(async (j) => {
          const [b] = await db.query.ballot.findMany({
            where: (b, { and, eq }) => and(eq(b.pairingId, p.id), eq(b.judgeId, j.judgeId)),
          });
          return getBallotContext(db, b!.id);
        }),
    );
    for (const ctx of ctxs) {
      const sim = simulateDebate(
        {
          roundId,
          roundSeq: 1,
          stage: "prelim",
          pairingId: p.id,
          entries: ctx.entries.map((e) => ({ entryId: e.id, side: e.side ?? "A" })),
          judgeIds: [ctx.judge.id],
        },
        {
          competitors: ctx.entries.flatMap((e) =>
            e.competitors.map((c) => ({ ...c, entryId: e.id })),
          ),
          strength: new Map(ctx.entries.map((e) => [e.id, rng.normal()])),
        },
        config,
        rng,
      );
      const b = sim.ballots[0]!;
      const token = await tokenFor(db, "judge", ctx.judge.id);
      const actor = tokenActor((await resolveToken(db, token!))!);
      await saveBallot(
        db,
        actor,
        ctx.ballot.id,
        {
          winnerId: b.winnerId,
          scores: b.scores.map((s) => ({ ...s, reply: false })),
          rfd: "Clear weighing.",
          acknowledgeWarnings: true,
        },
        "submit",
      );
    }
  }
}

describe("a full LD tournament through the domain services", () => {
  let tournamentId: string;
  let ldId: string;
  let congressId: string;

  it("creates a tournament from presets and enforces permissions", async () => {
    const t = await createTournament(db, owner, {
      name: "OpenTab Invitational",
      slug: "opentab-invitational",
      startsOn: "2026-10-10",
      endsOn: "2026-10-11",
      events: [
        { format: "ld", name: "Lincoln–Douglas", abbreviation: "LD" },
        { format: "congress", name: "Congress", abbreviation: "CON" },
      ],
      timeslots: 6,
    });
    tournamentId = t.id;
    const events = await listEvents(db, t.id);
    ldId = events.find((e) => e.abbreviation === "LD")!.id;
    congressId = events.find((e) => e.abbreviation === "CON")!.id;
    await expect(createRound(db, stranger, ldId, {})).rejects.toBeInstanceOf(DomainError);
    await setMember(db, owner, t.id, "tab@example.com", "tabber");
    await expect(
      createTournament(db, owner, {
        name: "Dup",
        slug: "opentab-invitational",
        startsOn: "2026-10-10",
        endsOn: "2026-10-10",
      }),
    ).rejects.toThrow(/taken/);
  });

  it("imports entries, judges and rooms from CSV", async () => {
    const sim = generateTournament({
      seed: "import",
      entries: 24,
      teamSize: 1,
      judges: 20,
      rooms: 16,
    });
    const schoolName = new Map(sim.schools.map((s) => [s.id, s.name]));
    const entriesCsv = [
      "Event,School,Debater",
      ...sim.entries.map(
        (e) =>
          `LD,${schoolName.get(e.schoolId!)},${sim.competitors.find((c) => c.entryId === e.id)!.name}`,
      ),
      ...Array.from(
        { length: 18 },
        (_, i) => `CON,${sim.schools[i % 6]!.name},Legislator ${i + 1}`,
      ),
    ].join("\n");
    const csv = parseCsv(entriesCsv);
    const mapping = guessMapping("entries", csv.headers);
    expect(mapping.competitor1).toBe(2);
    const preview = previewImport("entries", csv, mapping, { eventAbbrs: ["LD", "CON"] });
    expect(preview.every((r) => r.errors.length === 0)).toBe(true);
    const res = await commitImport(db, owner, tournamentId, "entries", preview);
    expect(res.created).toBe(42);

    const judgesCsv = parseCsv(
      [
        "Name,School,Rounds,Rating",
        ...sim.judges.map(
          (j) => `${j.name},${j.schoolId ? schoolName.get(j.schoolId) : ""},6,${j.rating}`,
        ),
      ].join("\n"),
    );
    await commitImport(
      db,
      owner,
      tournamentId,
      "judges",
      previewImport("judges", judgesCsv, guessMapping("judges", judgesCsv.headers), {
        eventAbbrs: [],
      }),
    );
    const roomsCsv = parseCsv(
      [
        "Room,Priority,Accessible",
        ...sim.rooms.map((r) => `${r.name},${r.priority},${r.accessible ? "yes" : "no"}`),
      ].join("\n"),
    );
    await commitImport(
      db,
      owner,
      tournamentId,
      "rooms",
      previewImport("rooms", roomsCsv, guessMapping("rooms", roomsCsv.headers), { eventAbbrs: [] }),
    );

    const bad = previewImport(
      "entries",
      parseCsv("Event,Debater\nXX,Someone\nLD,"),
      { event: 0, competitor1: 1 },
      { eventAbbrs: ["LD"] },
    );
    expect(bad[0]!.errors[0]).toMatch(/Unknown event/);
    expect(bad[1]!.errors[0]).toMatch(/required/);
    expect(
      await db.select().from(school).where(eq(school.tournamentId, tournamentId)),
    ).not.toHaveLength(0);
  });

  it("runs four power-matched prelims with private-link ballots", async () => {
    await ensureTokens(db, owner, tournamentId);
    const events = await listEvents(db, tournamentId);
    const config = events.find((e) => e.id === ldId)!.config as DebateConfig;
    for (let r = 1; r <= 4; r++) {
      const rd = await createRound(db, owner, ldId, {});
      expect(rd.method).toBe(r <= 2 ? "random" : "powermatch");
      const gen = await generateDraft(db, owner, rd.id);
      expect(gen.findings.filter((f) => f.severity === "error")).toEqual([]);
      const pairings = await loadRoundPairings(db, rd.id);
      expect(pairings.filter((p) => !p.bye).every((p) => p.judges.length === 1 && p.roomId)).toBe(
        true,
      );
      const findings = await checkRoundDraft(db, rd.id);
      expect(findings.filter((f) => f.severity === "error")).toEqual([]);
      const pub = await publishRound(db, owner, rd.id, queue);
      expect(pub.scheduled).toBe(false);
      expect(queue.jobs.at(-1)).toMatchObject({ name: "notify.round" });
      const board = await ballotBoard(db, rd.id);
      expect(board.counts.pending).toBe(board.counts.total);
      await submitRound(rd.id, config, `r${r}`);
      const after = await ballotBoard(db, rd.id);
      expect(after.counts.submitted).toBe(after.counts.total);
    }
    const standings = await computeStandings(db, ldId);
    expect(standings.rows).toHaveLength(24);
    const top = standings.rows[0]!;
    expect(top.record).toMatch(/^[34]–/);
    expect(standings.speakers.length).toBe(24);
    await publishStandings(db, owner, ldId);
    const pub = await publishedStandings(db, ldId);
    expect(pub?.rows[0]?.code).toBe(top.code);
  });

  it("supports draw edits, checks, and refuses to unpublish once ballots are in", async () => {
    const rounds = await db.query.round.findMany({ where: (r, { eq }) => eq(r.eventId, ldId) });
    const r4 = rounds.find((r) => r.seq === 4)!;
    await expect(unpublishRound(db, owner, r4.id)).rejects.toThrow(/Ballots/);

    const r5 = await createRound(db, owner, ldId, { label: "Round 5" });
    await generateDraft(db, owner, r5.id);
    const ps = (await loadRoundPairings(db, r5.id)).filter((p) => !p.bye);
    const [p1, p2] = ps as [(typeof ps)[number], (typeof ps)[number]];
    await applyEdit(db, owner, r5.id, {
      type: "swapEntries",
      a: { pairingId: p1.id, entryId: p1.entries[0]!.entryId },
      b: { pairingId: p2.id, entryId: p2.entries[0]!.entryId },
    });
    await applyEdit(db, owner, r5.id, { type: "flipSides", pairingId: p1.id });
    // Put p2's judge on p1 too: it's the same flight so the judge moves.
    await applyEdit(db, owner, r5.id, {
      type: "setJudge",
      pairingId: p1.id,
      judgeId: p2.judges[0]!.judgeId,
      role: "panelist",
    });
    const after = await loadRoundPairings(db, r5.id);
    expect(after.find((p) => p.id === p2.id)!.judges).toHaveLength(0);
    const findings = await checkRoundDraft(db, r5.id);
    expect(findings.some((f) => f.code === "underfilled_panel")).toBe(true);
    await expect(publishRound(db, owner, r5.id, queue)).rejects.toBeInstanceOf(DomainError);
    // Regenerate cleanly.
    const regen = await generateDraft(db, owner, r5.id);
    expect(regen.version).toBeGreaterThan(1);
  });

  it("breaks to elims and runs the bracket to a champion", async () => {
    const r5 = (await db.query.round.findMany({ where: (r, { eq }) => eq(r.eventId, ldId) })).find(
      (r) => r.seq === 5,
    )!;
    const { deleteRound } = await import("../src");
    await deleteRound(db, owner, r5.id);
    const ids = await createBreak(db, owner, ldId, 6);
    expect(ids).toHaveLength(6);
    const config = (await listEvents(db, tournamentId)).find((e) => e.id === ldId)!
      .config as DebateConfig;
    const labels: string[] = [];
    for (let i = 0; i < 3; i++) {
      const rd = await createRound(db, owner, ldId, {
        stage: "elim",
        settings: { breakSize: 8 / 2 ** i },
      });
      labels.push(rd.label);
      await generateDraft(db, owner, rd.id);
      const ps = await loadRoundPairings(db, rd.id);
      if (i === 0) expect(ps.filter((p) => p.bye)).toHaveLength(2);
      expect(ps.filter((p) => !p.bye).every((p) => p.judges.length === 3)).toBe(true);
      await publishRound(db, owner, rd.id, queue, { force: true });
      await submitRound(rd.id, config, `elim${i}`);
    }
    expect(labels).toEqual(["Quarterfinals", "Semifinals", "Finals"]);
    const bracket = await buildBracket(db, ldId);
    expect(bracket.rounds).toHaveLength(3);
    expect(bracket.champion).toBeTruthy();
  });

  it("lets entries submit pref sheets and judges see assignments", async () => {
    const [e] = await db.select().from(entry).where(eq(entry.eventId, ldId)).limit(1);
    const sheet = await getPrefSheet(db, e!.id);
    expect(sheet.judges.length).toBeGreaterThan(0);
    const token = await tokenFor(db, "entry", e!.id);
    const actor = tokenActor((await resolveToken(db, token!))!);
    const prefs = sheet.judges.map((j, i) => ({ judgeId: j.id, ordinal: i + 1 }));
    await savePrefSheet(db, actor, e!.id, { prefs, submit: true });
    const again = await getPrefSheet(db, e!.id);
    expect(again.prefs).toHaveLength(prefs.length);
    expect(again.submittedAt).toBeTruthy();
    await expect(savePrefSheet(db, stranger, e!.id, { prefs })).rejects.toBeInstanceOf(DomainError);

    const [j] = await db.select().from(judge).where(eq(judge.tournamentId, tournamentId)).limit(1);
    const assignments = await judgeAssignments(db, j!.id);
    expect(Array.isArray(assignments)).toBe(true);
  });

  it("plans notifications and powers public search", async () => {
    const snaps = await currentPairings(db, tournamentId);
    expect(snaps.length).toBeGreaterThan(0);
    const debate = snaps[0]!.debates.find((d) => !d.bye)!;
    await addFollow(db, tournamentId, {
      targetType: "entry",
      targetId: debate.entries[0]!.id,
      channel: "email",
      endpoint: "fan@example.com",
    });
    const plan = await planRoundNotifications(
      db,
      snaps[0]!.round.id,
      "published",
      "https://opentab.test",
    );
    expect(
      plan.some(
        (m) => m.endpoint === "fan@example.com" && m.body.includes(debate.entries[0]!.code),
      ),
    ).toBe(true);
    const hits = await findInPairings(db, tournamentId, debate.entries[0]!.code);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("runs a Congress session with chambers, speech log and scorer ballots", async () => {
    await db.update(room).set({ active: true });
    const rd = await createRound(db, owner, congressId, { settings: { chambers: 2 } });
    expect(rd.method).toBe("congress");
    await generateDraft(db, owner, rd.id);
    const chambers = await loadRoundPairings(db, rd.id);
    expect(chambers).toHaveLength(2);
    expect(chambers.map((c) => c.entries.length).sort()).toEqual([9, 9]);
    expect(chambers.every((c) => c.judges.length >= 1)).toBe(true);
    await publishRound(db, owner, rd.id, queue, { force: true });

    const ch = chambers[0]!;
    const first = ch.entries[0]!.entryId;
    await addSpeech(db, owner, ch.id, {
      entryId: first,
      legislation: "A Bill to Fund Debate",
      stance: "aff",
    });
    const q = await precedenceQueue(db, ch.id);
    expect(q.at(-1)!.entryId).toBe(first);

    for (const c of chambers) {
      for (const j of c.judges) {
        const [b] = await db.query.ballot.findMany({
          where: (b, { and, eq }) => and(eq(b.pairingId, c.id), eq(b.judgeId, j.judgeId)),
        });
        await saveBallot(
          db,
          owner,
          b!.id,
          {
            congress: {
              speeches: c.entries
                .slice(0, 6)
                .map((e, i) => ({ entryId: e.entryId, points: 6 - (i % 3) })),
              ranks: c.entries.slice(0, 8).map((e, i) => ({ entryId: e.entryId, rank: i + 1 })),
            },
            acknowledgeWarnings: true,
          },
          "submit",
        );
      }
    }
    const st = await computeStandings(db, congressId);
    expect(st.kind).toBe("congress");
    expect(st.rows).toHaveLength(18);
    expect(st.rows[0]!.values[0]).toBeGreaterThan(0);
  });

  it("keeps the audit trail", async () => {
    const logs = await db.query.auditLog.findMany({
      where: (a, { eq }) => eq(a.tournamentId, tournamentId),
    });
    expect(logs.length).toBeGreaterThan(20);
    expect(logs.some((l) => l.action === "round.publish")).toBe(true);
  });
});
