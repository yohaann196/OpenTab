/**
 * Seeds a realistic, in-progress demo tournament ("OpenTab Invitational").
 *
 *   pnpm db:seed                 # uses DATABASE_URL
 *   SEED_RESET=1 pnpm db:seed    # deletes the existing demo first
 *
 * Demo login: demo@opentab.dev / opentab-demo
 */
import { randomUUID } from "node:crypto";
import * as core from "@opentab/core";
import { account, createDb, entry, event, judge, tournament, user } from "@opentab/db";
import {
  type CongressConfig,
  type DebateConfig,
  generateTournament,
  Rng,
  simulateDebate,
} from "@opentab/engine";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const SLUG = "opentab-invitational";
const { db, sql } = createDb();
const queue = new core.MemoryQueue();
const rng = new Rng("seed");
const strength = new Map<string, number>();
const competitors = new Map<string, { id: string; entryId: string; name: string }[]>();

async function main() {
  const existing = await db.select().from(tournament).where(eq(tournament.slug, SLUG));
  if (existing.length) {
    if (!process.env.SEED_RESET) {
      console.log(`Demo tournament already exists at /t/${SLUG}. Set SEED_RESET=1 to recreate it.`);
      return;
    }
    await db.delete(tournament).where(eq(tournament.slug, SLUG));
  }

  // Demo user.
  const email = "demo@opentab.dev";
  let [u] = await db.select().from(user).where(eq(user.email, email));
  if (!u) {
    const id = randomUUID();
    [u] = await db
      .insert(user)
      .values({ id, name: "Demo Tab Director", email, emailVerified: true })
      .returning();
    await db.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword("opentab-demo"),
    });
  }
  const actor: core.Actor = { kind: "user", userId: u!.id, name: u!.name };

  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const t = await core.createTournament(db, actor, {
    name: "OpenTab Invitational",
    slug: SLUG,
    startsOn: iso(today),
    endsOn: iso(new Date(today.getTime() + 86400000)),
    location: "Lincoln, NE",
    timezone: "America/Chicago",
    events: [
      { format: "ld", name: "Varsity Lincoln–Douglas", abbreviation: "LD" },
      { format: "pf", name: "Varsity Public Forum", abbreviation: "PF" },
      { format: "policy", name: "Varsity Policy", abbreviation: "CX" },
      { format: "congress", name: "Congressional Debate", abbreviation: "CON" },
      { format: "world_schools", name: "World Schools", abbreviation: "WS" },
    ],
    timeslots: 6,
  });
  await core.updateTournament(db, actor, t.id, {
    status: "live",
    description:
      "A demo tournament showing OpenTab's live pairings, ballots and results. Everything here is synthetic.",
    settings: {
      publicStandings: true,
      showJudges: true,
      announcement: "Welcome! Round 4 is out — check the pairings page or search for your name.",
    },
  });
  const events = await core.listEvents(db, t.id);
  const byAbbr = (a: string) => events.find((e) => e.abbreviation === a)!;

  // Shared schools & judges.
  const base = generateTournament({
    seed: "demo",
    entries: 0,
    schools: 16,
    teamSize: 1,
    judges: 0,
    rooms: 44,
    idPrefix: "x",
  });
  const schoolIds: string[] = [];
  for (const s of base.schools) {
    const saved = await core.saveSchool(db, actor, t.id, {
      name: s.name,
      code: s.code,
      region: s.region,
    });
    schoolIds.push(saved.id);
  }
  for (const [i, r] of base.rooms.entries()) {
    await core.saveRoom(db, actor, t.id, {
      name: `${i < 22 ? "North" : "South"} ${r.name}`,
      building: i < 22 ? "North Hall" : "South Hall",
      priority: r.priority ?? 0,
      capacity: 30,
      accessible: !!r.accessible,
    });
  }

  const addEntries = async (abbr: string, n: number, teamSize: number) => {
    const ev = byAbbr(abbr);
    const sim = generateTournament({
      seed: `demo-${abbr}`,
      entries: n,
      schools: 16,
      teamSize,
      idPrefix: abbr,
    });
    for (const e of sim.entries) {
      const sIdx = Number(e.schoolId!.replace(`${abbr}s`, "")) - 1;
      const names = sim.competitors.filter((c) => c.entryId === e.id).map((c) => c.name);
      const schoolCode = base.schools[sIdx]!.code;
      const saved = await core.saveEntry(db, actor, t.id, {
        eventId: ev.id,
        schoolId: schoolIds[sIdx],
        code:
          teamSize === 1
            ? `${schoolCode} ${names[0]!.split(" ")[1]}`
            : `${schoolCode} ${names.map((x) => x.split(" ")[1]![0]).join("")}`,
        name: names.join(" & "),
        seed: e.seed,
        requiresAccessible: !!e.requiresAccessible,
        competitors: names.map((name) => ({ name })),
      });
      strength.set(saved.id, sim.strength.get(e.id)!);
    }
  };
  await addEntries("LD", 36, 1);
  await addEntries("PF", 28, 2);
  await addEntries("CX", 18, 2);
  await addEntries("CON", 32, 1);
  await addEntries("WS", 12, 5);

  const judgeSim = generateTournament({
    seed: "demo-judges",
    entries: 0,
    schools: 16,
    judges: 96,
    idPrefix: "j",
  });
  for (const j of judgeSim.judges) {
    const sIdx = j.schoolId ? Number(j.schoolId.replace("js", "")) - 1 : -1;
    await core.saveJudge(db, actor, t.id, {
      name: j.name,
      email: null,
      schoolId: sIdx >= 0 ? schoolIds[sIdx] : null,
      roundsOwed: 6,
      rating: j.rating ?? 5,
      paradigm:
        rng.next() < 0.6
          ? rng.pick([
              "Tech over truth, but explain your warrants. Weigh impacts explicitly in the last speeches. Speed is fine if you're clear.",
              "Lay/flow-ish parent judge. Please speak clearly and explain why your arguments matter. I vote on the clearest weighing.",
              "Former circuit debater. I'll evaluate any argument with a warrant. Theory is fine; frivolous shells get a low threshold.",
              "Traditional judge: values and criteria matter. Collapse in the final rebuttals and give me voting issues.",
            ])
          : null,
    });
  }
  const allEntries = await db.select().from(entry).where(eq(entry.tournamentId, t.id));
  for (const e of allEntries) {
    const comps = await db.query.competitor.findMany({ where: (c, { eq }) => eq(c.entryId, e.id) });
    competitors.set(
      e.id,
      comps.map((c) => ({ id: c.id, entryId: e.id, name: c.name })),
    );
  }
  await core.ensureTokens(db, actor, t.id);
  const timeslots = await core.listTimeslots(db, t.id);

  // Submits every pending ballot of a round with simulated scores.
  const playRound = async (roundId: string, cfg: DebateConfig) => {
    const pairings = await core.loadRoundPairings(db, roundId);
    for (const p of pairings) {
      if (p.bye) continue;
      const sim = simulateDebate(
        {
          roundId,
          roundSeq: 1,
          stage: "prelim",
          pairingId: p.id,
          entries: p.entries.map((e) => ({ entryId: e.entryId, side: e.side ?? "A" })),
          judgeIds: p.judges.filter((j) => j.role !== "trainee").map((j) => j.judgeId),
        },
        { competitors: [...competitors.values()].flat(), strength },
        cfg,
        rng,
      );
      for (const b of sim.ballots) {
        const row = await db.query.ballot.findFirst({
          where: (x, { and, eq }) => and(eq(x.pairingId, p.id), eq(x.judgeId, b.judgeId)),
        });
        if (!row) continue;
        const scores =
          cfg.format === "world_schools"
            ? wsdcScores(
                b.scores,
                p.entries.map((e) => e.entryId),
              )
            : b.scores.map((s) => ({ ...s, reply: false }));
        const winner = cfg.format === "world_schools" ? wsdcWinner(scores, b.winnerId) : b.winnerId;
        await core.saveBallot(
          db,
          core.systemActor,
          row.id,
          { winnerId: winner, scores, rfd: rng.pick(RFDS), acknowledgeWarnings: true },
          "submit",
        );
      }
    }
  };

  const runPrelims = async (abbr: string, played: number, publishNext: boolean) => {
    const ev = byAbbr(abbr);
    const cfg = ev.config as DebateConfig;
    for (let i = 0; i < played + (publishNext ? 1 : 0); i++) {
      const r = await core.createRound(db, actor, ev.id, {
        timeslotId: timeslots[i]?.id ?? null,
        flights: abbr === "LD" ? 2 : 1,
      });
      await core.generateDraft(db, actor, r.id);
      await core.publishRound(db, actor, r.id, queue, { force: true, notify: false });
      if (i < played) {
        await playRound(r.id, cfg);
        await core.setRoundCompleted(db, actor, r.id, true);
        await core.setBallotsReleased(db, actor, r.id, true);
      }
    }
  };

  console.log("Playing LD…");
  await runPrelims("LD", 3, true);
  console.log("Playing PF…");
  await runPrelims("PF", 3, true);
  console.log("Playing Policy…");
  await runPrelims("CX", 2, false);
  const cxDraft = await core.createRound(db, actor, byAbbr("CX").id, {
    timeslotId: timeslots[2]?.id ?? null,
  });
  await core.generateDraft(db, actor, cxDraft.id);
  console.log("Playing World Schools…");
  const ws = byAbbr("WS");
  await db
    .update(event)
    .set({
      config: {
        ...(ws.config as DebateConfig),
        judging: { ...(ws.config as DebateConfig).judging, prelimPanelSize: 1 },
      },
    })
    .where(eq(event.id, ws.id));
  for (let i = 0; i < 2; i++) {
    const r = await core.createRound(db, actor, ws.id, {
      timeslotId: timeslots[i + 3]?.id ?? null,
      motion:
        i === 0
          ? "This House believes that social media platforms should be treated as public utilities."
          : "This House would abolish standardized testing for university admissions.",
    });
    await core.generateDraft(db, actor, r.id);
    await core.publishRound(db, actor, r.id, queue, { force: true, notify: false });
    await core.releaseMotion(db, actor, r.id, queue);
    await playRound(r.id, (await core.getEvent(db, ws.id)).config as DebateConfig);
  }

  console.log("Playing Congress…");
  const con = byAbbr("CON");
  const conCfg = con.config as CongressConfig;
  const s1 = await core.createRound(db, actor, con.id, {
    settings: { chambers: 2 },
    timeslotId: timeslots[0]?.id ?? null,
  });
  await core.generateDraft(db, actor, s1.id);
  await core.publishRound(db, actor, s1.id, queue, { force: true, notify: false });
  const chambers = await core.loadRoundPairings(db, s1.id);
  for (const ch of chambers) {
    const order = [...ch.entries].sort(
      (a, b) => (strength.get(b.entryId) ?? 0) - (strength.get(a.entryId) ?? 0),
    );
    for (const [k, e] of order.slice(0, 10).entries()) {
      await core.addSpeech(db, actor, ch.id, {
        entryId: e.entryId,
        legislation:
          k < 5
            ? "A Bill to Expand Rural Broadband"
            : "A Resolution to Reform the Electoral College",
        stance: k % 2 ? "neg" : "aff",
      });
    }
    for (const j of ch.judges) {
      const row = await db.query.ballot.findFirst({
        where: (x, { and, eq }) => and(eq(x.pairingId, ch.id), eq(x.judgeId, j.judgeId)),
      });
      if (!row) continue;
      const perf = new Map(
        order.map((e) => [e.entryId, (strength.get(e.entryId) ?? 0) + rng.normal(0, 0.4)]),
      );
      const noisy = [...order].sort((a, b) => perf.get(b.entryId)! - perf.get(a.entryId)!);
      await core.saveBallot(
        db,
        core.systemActor,
        row.id,
        {
          congress: {
            speeches: order.slice(0, 10).map((e, k) => ({
              entryId: e.entryId,
              points: Math.max(conCfg.speechPoints.min, conCfg.speechPoints.max - (k % 4)),
            })),
            ranks: noisy
              .slice(0, conCfg.ranksPerBallot)
              .map((e, k) => ({ entryId: e.entryId, rank: k + 1 })),
          },
          acknowledgeWarnings: true,
        },
        "submit",
      );
    }
  }
  const s2 = await core.createRound(db, actor, con.id, {
    settings: { continueFromRoundId: s1.id },
    timeslotId: timeslots[1]?.id ?? null,
  });
  await core.generateDraft(db, actor, s2.id);
  await core.publishRound(db, actor, s2.id, queue, { force: true, notify: false });

  for (const abbr of ["LD", "PF", "WS", "CON"])
    await core.publishStandings(db, actor, byAbbr(abbr).id);

  // A couple of judges have started their round-4 ballots (for the live board).
  const judges = await db.select().from(judge).where(eq(judge.tournamentId, t.id));
  console.log(`\n✓ Seeded ${allEntries.length} entries, ${judges.length} judges.`);
  console.log(`  Public site:  /t/${SLUG}`);
  console.log(`  Tab room:     /tab/${SLUG}   (demo@opentab.dev / opentab-demo)`);
  const sampleJudge = await db.query.pairingJudge.findFirst();
  if (sampleJudge) {
    const token = await core.tokenFor(db, "judge", sampleJudge.judgeId);
    console.log(`  Judge portal: /p/${token}`);
  }
  const sampleEntry = allEntries.find((e) => e.eventId === byAbbr("CX").id);
  if (sampleEntry)
    console.log(`  Entry portal: /p/${await core.tokenFor(db, "entry", sampleEntry.id)}`);
}

const RFDS = [
  "Aff wins on the weighing: the magnitude comparison in the final speech was never answered, and the link turn on the economy argument was conceded.",
  "Neg wins. The framework debate went neg because the aff never explained why their standard better accounts for the resolution's burden.",
  "Close round. I vote on the clearest story — the second rebuttal collapsed well and extended the warrant for the uniqueness claim.",
  "The deciding issue was the solvency deficit; it was extended cleanly and the response came too late to be fair.",
];

type Score = {
  entryId: string;
  competitorId: string;
  position: number;
  points: number;
  rank?: number | null;
};

/** Converts simulated points into WSDC style/content/strategy scores with a reply. */
function wsdcScores(scores: Score[], entryIds: string[]) {
  const out: (Score & {
    reply: boolean;
    components: { style: number; content: number; strategy: number };
  })[] = [];
  for (const id of entryIds) {
    const mine = scores.filter((s) => s.entryId === id);
    const comps = competitors.get(id) ?? [];
    for (let k = 0; k < 3; k++) {
      const base = mine[k % Math.max(1, mine.length)]?.points ?? 70;
      const total = Math.min(80, Math.max(60, Math.round((60 + (base - 60)) * 2) / 2));
      const style = Math.min(32, Math.max(24, Math.round(total * 0.4 * 2) / 2));
      const strategy = Math.min(16, Math.max(12, Math.round(total * 0.2 * 2) / 2));
      const content = Math.min(32, Math.max(24, total - style - strategy));
      out.push({
        entryId: id,
        competitorId: comps[k]?.id ?? comps[0]!.id,
        position: k + 1,
        points: style + content + strategy,
        reply: false,
        components: { style, content, strategy },
      });
    }
    const first = out.find((s) => s.entryId === id && s.position === 1)!;
    const rs = Math.round((first.components.style / 2) * 2) / 2;
    const rc = Math.round((first.components.content / 2) * 2) / 2;
    const rt = Math.round((first.components.strategy / 2) * 2) / 2;
    out.push({
      entryId: id,
      competitorId: first.competitorId,
      position: 4,
      points: rs + rc + rt,
      reply: true,
      components: { style: rs, content: rc, strategy: rt },
    });
  }
  return out;
}

function wsdcWinner(scores: { entryId: string; points: number }[], fallback: string | null) {
  const totals = new Map<string, number>();
  for (const s of scores) totals.set(s.entryId, (totals.get(s.entryId) ?? 0) + s.points);
  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length === 2 && sorted[0]![1] === sorted[1]![1]) {
    // Break the tie by nudging the fallback winner's reply.
    const r = scores.find(
      (s) => s.entryId === (fallback ?? sorted[0]![0]) && (s as { reply?: boolean }).reply,
    ) as (typeof scores)[number] & { components: { style: number } };
    r.points += 0.5;
    r.components.style += 0.5;
    return fallback ?? sorted[0]![0];
  }
  return sorted[0]![0];
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
