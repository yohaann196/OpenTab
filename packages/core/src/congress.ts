import {
  ballot,
  congressSpeech,
  type Db,
  pairing,
  pairingJudge,
  type Queryable,
  round,
} from "@opentab/db";
import {
  type CongressBallotRecord,
  type CongressConfig,
  computeCongressStandings,
} from "@opentab/engine";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { Actor } from "./actor";
import { requireRole } from "./authz";
import { assertFound, forbidden } from "./errors";
import { loadEventBundle, loadRoundPairings } from "./loaders";
import { emit } from "./realtime";

/** Congress ballots (submitted/confirmed) of an event stage, with chamber membership. */
export async function congressBallots(db: Queryable, eventId: string, stage: "prelim" | "elim") {
  const rounds = await db
    .select()
    .from(round)
    .where(and(eq(round.eventId, eventId), eq(round.stage, stage), ne(round.status, "draft")))
    .orderBy(asc(round.seq));
  const members = new Map<string, string[]>();
  const records: (CongressBallotRecord & { chamberLabel: string })[] = [];
  for (const r of rounds) {
    const ps = await loadRoundPairings(db, r.id);
    for (const p of ps)
      members.set(
        `${r.seq}:${p.id}`,
        p.entries.map((e) => e.entryId),
      );
    const ids = ps.map((p) => p.id);
    if (!ids.length) continue;
    const bs = await db
      .select()
      .from(ballot)
      .where(
        and(inArray(ballot.pairingId, ids), inArray(ballot.status, ["submitted", "confirmed"])),
      );
    const roles = await db.select().from(pairingJudge).where(inArray(pairingJudge.pairingId, ids));
    for (const b of bs) {
      const p = ps.find((x) => x.id === b.pairingId)!;
      const role = roles.find((x) => x.pairingId === b.pairingId && x.judgeId === b.judgeId)?.role;
      records.push({
        roundSeq: r.seq,
        chamberId: p.id,
        chamberLabel: p.label ?? p.id,
        judgeId: b.judgeId,
        parliamentarian: role === "parliamentarian",
        ranks: b.congress?.ranks ?? [],
        speeches: b.congress?.speeches ?? [],
        po: b.congress?.po ?? null,
      });
    }
  }
  return { records, members };
}

export async function congressStandings(
  db: Queryable,
  eventId: string,
  stage: "prelim" | "elim",
  chamberLabel?: string,
) {
  const bundle = await loadEventBundle(db, eventId);
  const cfg = bundle.config as CongressConfig;
  const { records, members } = await congressBallots(db, eventId, stage);
  const filtered = chamberLabel ? records.filter((r) => r.chamberLabel === chamberLabel) : records;
  let entries = bundle.entries;
  if (chamberLabel) {
    const inChamber = new Set(
      [...members.entries()]
        .filter(([k]) => filtered.some((f) => `${f.roundSeq}:${f.chamberId}` === k))
        .flatMap(([, v]) => v),
    );
    entries = entries.filter((e) => inChamber.has(e.id));
  }
  return computeCongressStandings(entries, filtered, cfg.tiebreaks, {
    ranksPerBallot: cfg.ranksPerBallot,
    chamberMembers: members,
    seed: eventId,
  });
}

/** Entries advancing from prelim chambers (top N per chamber), best first. */
export async function congressBreak(db: Queryable, eventId: string): Promise<string[]> {
  const bundle = await loadEventBundle(db, eventId);
  const cfg = bundle.config as CongressConfig;
  const { records } = await congressBallots(db, eventId, "prelim");
  const labels = [...new Set(records.map((r) => r.chamberLabel))].sort();
  const perChamber: string[][] = [];
  for (const label of labels) {
    const st = await congressStandings(db, eventId, "prelim", label);
    perChamber.push(st.slice(0, cfg.advancePerChamber).map((r) => r.item.entryId));
  }
  // Interleave so seeds alternate across chambers (1st of A, 1st of B, 2nd of A...).
  const out: string[] = [];
  for (let i = 0; i < cfg.advancePerChamber; i++)
    for (const c of perChamber) if (c[i]) out.push(c[i]!);
  return out;
}

// ---------------------------------------------------------------------------
// Speech log & precedence (PO / parliamentarian tool)
// ---------------------------------------------------------------------------

async function canRunChamber(db: Queryable, actor: Actor, pairingId: string) {
  const [p] = await db.select().from(pairing).where(eq(pairing.id, pairingId));
  const pr = assertFound(p, "Chamber");
  const [r] = await db.select().from(round).where(eq(round.id, pr.roundId));
  if (actor.kind === "token") {
    if (actor.subjectType !== "judge") throw forbidden();
    const [pj] = await db
      .select()
      .from(pairingJudge)
      .where(and(eq(pairingJudge.pairingId, pairingId), eq(pairingJudge.judgeId, actor.subjectId)));
    if (!pj) throw forbidden("You're not assigned to this chamber");
  } else {
    await requireRole(db, actor, r!.tournamentId, "checker");
  }
  return { pairing: pr, round: r! };
}

export async function listSpeeches(db: Queryable, pairingId: string) {
  return db
    .select()
    .from(congressSpeech)
    .where(eq(congressSpeech.pairingId, pairingId))
    .orderBy(asc(congressSpeech.seq));
}

/**
 * Speaker queue order for the chamber: fewest speeches first (precedence),
 * then whoever spoke least recently (recency), then seat order.
 */
export async function precedenceQueue(db: Queryable, pairingId: string) {
  const ps = await db.select().from(pairing).where(eq(pairing.id, pairingId));
  const p = assertFound(ps[0], "Chamber");
  const members =
    (await loadRoundPairings(db, p.roundId)).find((x) => x.id === pairingId)?.entries ?? [];
  const speeches = await listSpeeches(db, pairingId);
  const count = new Map<string, number>();
  const last = new Map<string, number>();
  for (const s of speeches) {
    count.set(s.entryId, (count.get(s.entryId) ?? 0) + 1);
    last.set(s.entryId, s.seq);
  }
  return members
    .map((m) => ({
      entryId: m.entryId,
      seat: m.position,
      speeches: count.get(m.entryId) ?? 0,
      lastSpoke: last.get(m.entryId) ?? 0,
    }))
    .sort((a, b) => a.speeches - b.speeches || a.lastSpoke - b.lastSpoke || a.seat - b.seat);
}

export async function addSpeech(
  db: Db,
  actor: Actor,
  pairingId: string,
  input: { entryId: string; legislation?: string; stance?: string },
) {
  return db.transaction(async (tx) => {
    const { round: r } = await canRunChamber(tx, actor, pairingId);
    const members =
      (await loadRoundPairings(tx, r.id)).find((p) => p.id === pairingId)?.entries ?? [];
    if (!members.some((m) => m.entryId === input.entryId))
      throw forbidden("That legislator isn't in this chamber");
    const existing = await listSpeeches(tx, pairingId);
    const [row] = await tx
      .insert(congressSpeech)
      .values({
        pairingId,
        entryId: input.entryId,
        seq: (existing.at(-1)?.seq ?? 0) + 1,
        legislation: input.legislation ?? null,
        stance: input.stance ?? null,
      })
      .returning();
    await emit(tx, r.tournamentId, {
      type: "ballot.updated",
      roundId: r.id,
      pairingId,
      status: "speech",
    });
    return row!;
  });
}

export async function removeSpeech(db: Db, actor: Actor, pairingId: string, speechId: string) {
  await canRunChamber(db, actor, pairingId);
  await db
    .delete(congressSpeech)
    .where(and(eq(congressSpeech.id, speechId), eq(congressSpeech.pairingId, pairingId)));
}
