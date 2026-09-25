import {
  ballot,
  type Db,
  pairing,
  pairingEntry,
  pairingJudge,
  publishedSnapshot,
  type Queryable,
  type RoundSettings,
  round,
} from "@opentab/db";
import {
  allocateJudges,
  allocateRooms,
  assignChambers,
  type CongressConfig,
  checkRound,
  type DebateConfig,
  elimRoundName,
  type Finding,
  hasBlockingErrors,
  isDebateConfig,
  type PanelSlot,
  pairTwoTeamRound,
  Rng,
  roundRobinSchedule,
  type Side,
} from "@opentab/engine";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { generateElimPairings } from "./elims";
import { assertFound, DomainError, invalid } from "./errors";
import type { JobQueue } from "./jobs";
import {
  type LoadedPairing,
  loadDebateResults,
  loadEventBundle,
  loadJudgesForRound,
  loadPrefs,
  loadRoomsForRound,
  loadRound,
  loadRoundPairings,
} from "./loaders";
import { emit } from "./realtime";
import { buildPairingsSnapshot } from "./snapshots";

// ---------------------------------------------------------------------------
// Round lifecycle
// ---------------------------------------------------------------------------

export const createRoundSchema = z.object({
  label: z.string().trim().max(60).optional(),
  stage: z.enum(["prelim", "elim"]).default("prelim"),
  method: z
    .enum([
      "random",
      "protected",
      "balanced",
      "powermatch",
      "round_robin",
      "elim",
      "congress",
      "manual",
    ])
    .optional(),
  timeslotId: z.uuid().nullable().optional(),
  flights: z.number().int().min(1).max(3).optional(),
  panelSize: z.number().int().min(1).max(9).optional(),
  motion: z.string().max(1000).nullable().optional(),
  startsAt: z.coerce.date().nullable().optional(),
  settings: z
    .object({
      breakSize: z.number().int().min(2).max(256),
      reseed: z.boolean(),
      chambers: z.number().int().min(1).max(40),
      continueFromRoundId: z.uuid(),
    })
    .partial()
    .optional(),
});

export async function listRounds(db: Queryable, eventId: string) {
  return db.select().from(round).where(eq(round.eventId, eventId)).orderBy(asc(round.seq));
}

export async function createRound(
  db: Db,
  actor: Actor,
  eventId: string,
  raw: z.input<typeof createRoundSchema>,
) {
  const input = createRoundSchema.parse(raw);
  return db.transaction(async (tx) => {
    const bundle = await loadEventBundle(tx, eventId);
    await requireRole(tx, actor, bundle.event.tournamentId, "tabber");
    const [last] = await tx
      .select()
      .from(round)
      .where(eq(round.eventId, eventId))
      .orderBy(desc(round.seq))
      .limit(1);
    const seq = (last?.seq ?? 0) + 1;
    const cfg = bundle.config;
    const isCongress = cfg.format === "congress";
    const prelimsSoFar = (await listRounds(tx, eventId)).filter((r) => r.stage === "prelim").length;
    let method = input.method;
    if (!method) {
      if (isCongress) method = "congress";
      else if (input.stage === "elim") method = "elim";
      else
        method =
          prelimsSoFar + 1 <= (cfg as DebateConfig).pairing.presetRounds
            ? (cfg as DebateConfig).pairing.presetMethod
            : "powermatch";
    }
    const panelSize =
      input.panelSize ??
      (isCongress
        ? (cfg as CongressConfig).scorersPerChamber +
          ((cfg as CongressConfig).parliamentarian ? 1 : 0)
        : input.stage === "elim"
          ? (cfg as DebateConfig).judging.elimPanelSize
          : (cfg as DebateConfig).judging.prelimPanelSize);
    const settings: RoundSettings = { ...input.settings };
    if (isCongress && !settings.chambers) {
      const active = bundle.entries.filter((e) => e.active !== false).length;
      settings.chambers = Math.max(1, Math.round(active / (cfg as CongressConfig).chamberSize));
    }
    let label = input.label;
    if (!label) {
      if (input.stage === "elim" && settings.breakSize) label = elimRoundName(settings.breakSize);
      else if (isCongress)
        label = input.stage === "elim" ? "Super Session" : `Session ${prelimsSoFar + 1}`;
      else label = input.stage === "elim" ? `Elim ${seq}` : `Round ${prelimsSoFar + 1}`;
    }
    const [row] = await tx
      .insert(round)
      .values({
        tournamentId: bundle.event.tournamentId,
        eventId,
        seq,
        label,
        stage: input.stage,
        method,
        timeslotId: input.timeslotId ?? null,
        flights: input.flights ?? 1,
        panelSize,
        motion: input.motion ?? null,
        startsAt: input.startsAt ?? null,
        settings,
      })
      .returning();
    await audit(tx, actor, {
      tournamentId: bundle.event.tournamentId,
      action: "round.create",
      entityType: "round",
      entityId: row!.id,
      summary: `Created ${bundle.event.abbreviation} ${label}`,
    });
    return row!;
  });
}

export const updateRoundSchema = createRoundSchema
  .pick({
    label: true,
    timeslotId: true,
    flights: true,
    panelSize: true,
    motion: true,
    startsAt: true,
    method: true,
  })
  .partial();

export async function updateRound(
  db: Db,
  actor: Actor,
  roundId: string,
  raw: z.input<typeof updateRoundSchema>,
) {
  const input = updateRoundSchema.parse(raw);
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    const [after] = await tx.update(round).set(input).where(eq(round.id, roundId)).returning();
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.update",
      entityType: "round",
      entityId: roundId,
      summary: `Updated ${r.label}`,
      before: r,
      after,
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
    return after!;
  });
}

export async function deleteRound(db: Db, actor: Actor, roundId: string) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "director");
    const [later] = await tx
      .select()
      .from(round)
      .where(and(eq(round.eventId, r.eventId), ne(round.id, r.id)))
      .orderBy(desc(round.seq))
      .limit(1);
    if (later && later.seq > r.seq) throw invalid("Delete later rounds first");
    const submitted = await tx
      .select({ id: ballot.id })
      .from(ballot)
      .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
      .where(and(eq(pairing.roundId, roundId), inArray(ballot.status, ["submitted", "confirmed"])));
    if (submitted.length) throw invalid("This round has submitted ballots; it can't be deleted");
    await tx.delete(publishedSnapshot).where(eq(publishedSnapshot.refId, roundId));
    await tx.delete(round).where(eq(round.id, roundId));
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.delete",
      entityType: "round",
      entityId: roundId,
      summary: `Deleted ${r.label}`,
      before: r,
    });
    await emit(tx, r.tournamentId, { type: "round.unpublished", roundId, eventId: r.eventId });
  });
}

// ---------------------------------------------------------------------------
// Draft serialisation (audit + revert)
// ---------------------------------------------------------------------------

export interface SerializedPairing {
  flight: number;
  bracket: number | null;
  bye: boolean;
  roomId: string | null;
  locked: boolean;
  sidesPending: boolean;
  elimSlot: number | null;
  label: string | null;
  forfeitEntryId: string | null;
  explain: { term: string; cost: number; detail: string }[] | null;
  entries: { entryId: string; side: Side | null; position: number; pulledUp: boolean }[];
  judges: {
    judgeId: string;
    role: "chair" | "panelist" | "trainee" | "parliamentarian" | "scorer";
  }[];
}

export function serializePairings(ps: LoadedPairing[]): SerializedPairing[] {
  return ps.map((p) => ({
    flight: p.flight,
    bracket: p.bracket,
    bye: p.bye,
    roomId: p.roomId,
    locked: p.locked,
    sidesPending: p.sidesPending,
    elimSlot: p.elimSlot,
    label: p.label,
    forfeitEntryId: p.forfeitEntryId,
    explain: p.explain ?? null,
    entries: p.entries.map((e) => ({
      entryId: e.entryId,
      side: e.side,
      position: e.position,
      pulledUp: e.pulledUp,
    })),
    judges: p.judges.map((j) => ({ judgeId: j.judgeId, role: j.role })),
  }));
}

async function writePairings(
  tx: Queryable,
  roundId: string,
  items: SerializedPairing[],
  startSort = 0,
) {
  for (const [i, p] of items.entries()) {
    const [row] = await tx
      .insert(pairing)
      .values({
        roundId,
        sort: startSort + i,
        flight: p.flight,
        bracket: p.bracket,
        bye: p.bye,
        roomId: p.roomId,
        locked: p.locked,
        sidesPending: p.sidesPending,
        elimSlot: p.elimSlot,
        label: p.label,
        forfeitEntryId: p.forfeitEntryId,
        explain: p.explain,
      })
      .returning({ id: pairing.id });
    if (p.entries.length) {
      await tx.insert(pairingEntry).values(p.entries.map((e) => ({ pairingId: row!.id, ...e })));
    }
    if (p.judges.length) {
      await tx.insert(pairingJudge).values(p.judges.map((j) => ({ pairingId: row!.id, ...j })));
    }
  }
}

async function bumpVersion(tx: Queryable, roundId: string): Promise<number> {
  const r = await loadRound(tx, roundId);
  const [after] = await tx
    .update(round)
    .set({ version: r.version + 1 })
    .where(eq(round.id, roundId))
    .returning({ version: round.version });
  return after!.version;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export interface GenerateOptions {
  seed?: string;
  /** Also place judges and rooms (default true). */
  allocate?: boolean;
}

export async function generateDraft(
  db: Db,
  actor: Actor,
  roundId: string,
  opts: GenerateOptions = {},
) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    if (r.status !== "draft") throw invalid("Unpublish the round before re-pairing it");
    const bundle = await loadEventBundle(tx, r.eventId);
    const before = serializePairings(await loadRoundPairings(tx, roundId));
    const seed = opts.seed ?? `${r.id}:${r.version + 1}`;
    const findings: Finding[] = [];

    const locked = before.filter((p) => p.locked);
    await tx.delete(pairing).where(and(eq(pairing.roundId, roundId), eq(pairing.locked, false)));

    let fresh: SerializedPairing[] = [];
    const cfg = bundle.config;
    if (cfg.format === "congress") {
      fresh = await congressChambers(tx, r, bundle, seed);
    } else if (r.stage === "elim" || r.method === "elim") {
      const out = await generateElimPairings(tx, r, bundle, seed);
      fresh = out.pairings;
      findings.push(...out.findings);
    } else if (r.method === "round_robin") {
      fresh = roundRobinPairings(
        r,
        bundle.entries.filter((e) => e.active !== false),
        seed,
      );
    } else if (r.method === "manual") {
      fresh = [];
    } else {
      const results = await loadDebateResults(tx, r.eventId, { beforeSeq: r.seq, stage: "prelim" });
      const prelimSeq = (await listRounds(tx, r.eventId)).filter(
        (x) => x.stage === "prelim" && x.seq <= r.seq,
      ).length;
      const out = pairTwoTeamRound({
        entries: bundle.entries,
        results,
        roundSeq: prelimSeq,
        config: cfg as DebateConfig,
        method: r.method as "random" | "protected" | "balanced" | "powermatch",
        seed,
        locked: locked.map((l) => ({
          entryIds: l.entries.map((e) => e.entryId),
          sides: l.entries.map((e) => e.side ?? "A"),
        })),
      });
      findings.push(...out.findings);
      fresh = out.debates
        .filter((d) => !d.locked)
        .map((d) => ({
          flight: 1,
          bracket: d.bracket,
          bye: d.bye,
          roomId: null,
          locked: false,
          sidesPending: d.sidesPending,
          elimSlot: null,
          label: null,
          forfeitEntryId: null,
          explain: d.explain.map((t) => ({ term: t.term, cost: t.cost, detail: t.detail })),
          entries: d.entries.map((e, i) => ({
            entryId: e.entryId,
            side: d.bye ? null : e.side,
            position: i,
            pulledUp: d.pulledUpIds.includes(e.entryId),
          })),
          judges: [],
        }));
      if (r.flights > 1) {
        // Split debates into flights evenly, keeping bracket order interleaved.
        let k = 0;
        for (const p of fresh) {
          if (p.bye) continue;
          p.flight = (k % r.flights) + 1;
          k++;
        }
      }
    }
    await writePairings(tx, roundId, fresh, locked.length);
    const version = await bumpVersion(tx, roundId);

    if (opts.allocate !== false && fresh.length) {
      findings.push(...(await allocateJudgesTx(tx, roundId)));
      findings.push(...(await allocateRoomsTx(tx, roundId)));
    }

    const after = serializePairings(await loadRoundPairings(tx, roundId));
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.generate",
      entityType: "round",
      entityId: roundId,
      summary: `Generated ${r.label} (v${version})`,
      before,
      after,
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
    return { version, findings };
  });
}

function roundRobinPairings(
  r: typeof round.$inferSelect,
  entries: { id: string; seed?: number | null }[],
  seed: string,
): SerializedPairing[] {
  const ordered = [...new Rng(`${seed}:rr`).shuffle(entries)].sort(
    (a, b) => (a.seed ?? 1e9) - (b.seed ?? 1e9),
  );
  const schedule = roundRobinSchedule(ordered.map((e) => e.id));
  const idx = (r.seq - 1) % Math.max(1, schedule.length);
  return (schedule[idx] ?? []).map(([a, b]) => ({
    flight: 1,
    bracket: null,
    bye: b === null,
    roomId: null,
    locked: false,
    sidesPending: false,
    elimSlot: null,
    label: null,
    forfeitEntryId: null,
    explain: null,
    entries:
      b === null
        ? [{ entryId: a, side: null, position: 0, pulledUp: false }]
        : [
            { entryId: a, side: "A" as const, position: 0, pulledUp: false },
            { entryId: b, side: "B" as const, position: 1, pulledUp: false },
          ],
    judges: [],
  }));
}

async function congressChambers(
  tx: Queryable,
  r: typeof round.$inferSelect,
  bundle: Awaited<ReturnType<typeof loadEventBundle>>,
  seed: string,
): Promise<SerializedPairing[]> {
  const settings = r.settings ?? {};
  let chambers: string[][];
  const prevId = settings.continueFromRoundId;
  if (prevId) {
    const prev = await loadRoundPairings(tx, prevId);
    chambers = prev.map((p) => p.entries.map((e) => e.entryId));
  } else if (r.stage === "elim") {
    const { congressBreak } = await import("./congress");
    const advancing = await congressBreak(tx, r.eventId);
    const pool = bundle.entries
      .filter((e) => advancing.includes(e.id))
      .map((e) => ({ ...e, seed: advancing.indexOf(e.id) + 1 }));
    chambers = assignChambers(pool, settings.chambers ?? 1, seed).map((c) => c.map((e) => e.id));
  } else {
    chambers = assignChambers(
      bundle.entries.filter((e) => e.active !== false),
      settings.chambers ?? 1,
      seed,
    ).map((c) => c.map((e) => e.id));
  }
  return chambers.map((members, i) => ({
    flight: 1,
    bracket: null,
    bye: false,
    roomId: null,
    locked: false,
    sidesPending: false,
    elimSlot: null,
    label: `Chamber ${String.fromCharCode(65 + i)}`,
    forfeitEntryId: null,
    explain: null,
    entries: members.map((id, k) => ({
      entryId: id,
      side: null,
      position: k + 1,
      pulledUp: false,
    })),
    judges: [],
  }));
}

// ---------------------------------------------------------------------------
// Judge & room allocation
// ---------------------------------------------------------------------------

export async function allocateJudgesForRound(db: Db, actor: Actor, roundId: string) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    const before = serializePairings(await loadRoundPairings(tx, roundId));
    const findings = await allocateJudgesTx(tx, roundId);
    await bumpVersion(tx, roundId);
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.judges",
      entityType: "round",
      entityId: roundId,
      summary: `Placed judges for ${r.label}`,
      before,
      after: serializePairings(await loadRoundPairings(tx, roundId)),
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
    return findings;
  });
}

async function allocateJudgesTx(tx: Queryable, roundId: string): Promise<Finding[]> {
  const r = await loadRound(tx, roundId);
  const bundle = await loadEventBundle(tx, r.eventId);
  const pairings = await loadRoundPairings(tx, roundId);
  const { judges, history } = await loadJudgesForRound(tx, r);
  const cfg = bundle.config;
  const isCongress = cfg.format === "congress";
  const judging = isDebateConfig(cfg)
    ? cfg.judging
    : {
        prelimPanelSize: 3,
        elimPanelSize: 3,
        prefs: "none" as const,
        tiers: [],
        strikes: 0,
        maxPrefPercentile: 100,
        mutualityWeight: 1,
        allowSameSchool: false,
        avoidRepeatJudging: false,
        blockOutstandingBallots: true,
      };
  const roundsOwed = new Map(judges.map((j) => [j.id, j.roundsOwed ?? 0]));
  const prefs = isCongress ? undefined : await loadPrefs(tx, r.eventId, judging, roundsOwed);

  const unlocked = pairings.filter((p) => !p.locked && !p.bye);
  if (unlocked.length) {
    await tx.delete(pairingJudge).where(
      and(
        inArray(
          pairingJudge.pairingId,
          unlocked.map((p) => p.id),
        ),
        ne(pairingJudge.role, "trainee"),
      ),
    );
  }
  const maxBracket = Math.max(1, ...pairings.map((p) => p.bracket ?? 0));
  const lockedJudges = new Set(
    pairings.filter((p) => p.locked).flatMap((p) => p.judges.map((j) => j.judgeId)),
  );
  const codeOf = new Map(bundle.entries.map((e) => [e.id, e.code]));
  const panels: PanelSlot[] = unlocked.map((p) => ({
    key: p.id,
    label: p.label ?? p.entries.map((e) => codeOf.get(e.entryId) ?? "?").join(" vs "),
    entryIds: p.entries.map((e) => e.entryId),
    flight: p.flight,
    importance: r.stage === "elim" ? 1 : p.bracket != null ? p.bracket / maxBracket : 0.5,
    size: r.panelSize,
  }));
  const traineeIds = new Set(
    unlocked.flatMap((p) => p.judges.filter((j) => j.role === "trainee").map((j) => j.judgeId)),
  );
  const out = allocateJudges({
    panels,
    judges: judges.map((j) =>
      lockedJudges.has(j.id) || traineeIds.has(j.id) ? { ...j, available: false } : j,
    ),
    entries: bundle.entries,
    prefs,
    history,
    settings: judging,
    softSchoolConflicts: isCongress,
  });
  for (const a of out.assignments) {
    if (a.judges.length === 0) continue;
    await tx.insert(pairingJudge).values(
      a.judges.map((j) => ({
        pairingId: a.panelKey,
        judgeId: j.judgeId,
        role: isCongress
          ? j.role === "chair" && (cfg as CongressConfig).parliamentarian
            ? ("parliamentarian" as const)
            : ("scorer" as const)
          : j.role,
      })),
    );
  }
  return out.findings;
}

export async function allocateRoomsForRound(db: Db, actor: Actor, roundId: string) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    const findings = await allocateRoomsTx(tx, roundId);
    await bumpVersion(tx, roundId);
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.rooms",
      entityType: "round",
      entityId: roundId,
      summary: `Placed rooms for ${r.label}`,
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
    return findings;
  });
}

async function allocateRoomsTx(tx: Queryable, roundId: string): Promise<Finding[]> {
  const r = await loadRound(tx, roundId);
  const bundle = await loadEventBundle(tx, r.eventId);
  const pairings = await loadRoundPairings(tx, roundId);
  const { rooms } = await loadRoomsForRound(tx, r);
  const entryById = new Map(bundle.entries.map((e) => [e.id, e]));
  const targets = pairings.filter((p) => !p.bye && !p.locked);
  const lockedRooms = new Set(
    pairings.filter((p) => p.locked && p.roomId).map((p) => `${p.flight}:${p.roomId}`),
  );

  // Preferred rooms: judge's room in an earlier flight; chamber's previous room.
  const preferred = new Map<string, string>();
  for (const p of targets) {
    if (p.flight > 1) {
      const judgeIds = new Set(p.judges.map((j) => j.judgeId));
      const earlier = pairings.find(
        (q) => q.flight < p.flight && q.roomId && q.judges.some((j) => judgeIds.has(j.judgeId)),
      );
      if (earlier?.roomId) preferred.set(p.id, earlier.roomId);
    }
  }
  if (bundle.config.format === "congress" && r.settings?.continueFromRoundId) {
    const prev = await loadRoundPairings(tx, r.settings.continueFromRoundId);
    for (const p of targets) {
      const match = prev.find((q) => q.label === p.label);
      if (match?.roomId) preferred.set(p.id, match.roomId);
    }
  }
  const maxBracket = Math.max(1, ...pairings.map((p) => p.bracket ?? 0));
  const out = allocateRooms(
    targets.map((p) => ({
      key: p.id,
      label: p.label ?? p.entries.map((e) => entryById.get(e.entryId)?.code ?? "?").join(" vs "),
      flight: p.flight,
      importance: r.stage === "elim" ? 1 : p.bracket != null ? p.bracket / maxBracket : 0.5,
      requiresAccessible: p.entries.some((e) => entryById.get(e.entryId)?.requiresAccessible),
      people: p.entries.length * (bundle.config.format === "congress" ? 1 : 3) + r.panelSize,
      preferredRoomId: preferred.get(p.id) ?? null,
    })),
    rooms.map((room) => ({ ...room, available: room.available })),
  );
  for (const p of targets) {
    let roomId = out.assignments.get(p.id) ?? null;
    if (roomId && lockedRooms.has(`${p.flight}:${roomId}`)) roomId = null;
    await tx.update(pairing).set({ roomId }).where(eq(pairing.id, p.id));
  }
  return out.findings;
}

// ---------------------------------------------------------------------------
// Manual edits (draw editor)
// ---------------------------------------------------------------------------

export const editOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("swapEntries"),
    a: z.object({ pairingId: z.uuid(), entryId: z.uuid() }),
    b: z.object({ pairingId: z.uuid(), entryId: z.uuid() }),
  }),
  z.object({ type: z.literal("flipSides"), pairingId: z.uuid() }),
  z.object({
    type: z.literal("setJudge"),
    pairingId: z.uuid(),
    judgeId: z.uuid(),
    role: z.enum(["chair", "panelist", "trainee", "parliamentarian", "scorer"]).default("panelist"),
  }),
  z.object({ type: z.literal("removeJudge"), pairingId: z.uuid(), judgeId: z.uuid() }),
  z.object({ type: z.literal("setRoom"), pairingId: z.uuid(), roomId: z.uuid().nullable() }),
  z.object({ type: z.literal("toggleLock"), pairingId: z.uuid() }),
  z.object({
    type: z.literal("setFlight"),
    pairingId: z.uuid(),
    flight: z.number().int().min(1).max(3),
  }),
  z.object({ type: z.literal("moveEntry"), entryId: z.uuid(), toPairingId: z.uuid().nullable() }),
  z.object({ type: z.literal("setForfeit"), pairingId: z.uuid(), entryId: z.uuid().nullable() }),
  z.object({ type: z.literal("setSidesPending"), pairingId: z.uuid(), pending: z.boolean() }),
]);
export type EditOp = z.infer<typeof editOpSchema>;

export async function applyEdit(db: Db, actor: Actor, roundId: string, raw: EditOp) {
  const op = editOpSchema.parse(raw);
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    if (r.status === "completed")
      throw invalid("This round is completed; reopen it to make changes");
    const pairings = await loadRoundPairings(tx, roundId);
    const isCongress = (await loadEventBundle(tx, r.eventId)).config.format === "congress";
    const byId = new Map(pairings.map((p) => [p.id, p]));
    const get = (id: string) => assertFound(byId.get(id), "Debate");
    const before = serializePairings(pairings);
    let summary = "";

    switch (op.type) {
      case "swapEntries": {
        const pa = get(op.a.pairingId);
        const pb = get(op.b.pairingId);
        const ea = assertFound(
          pa.entries.find((e) => e.entryId === op.a.entryId),
          "Entry in debate",
        );
        const eb = assertFound(
          pb.entries.find((e) => e.entryId === op.b.entryId),
          "Entry in debate",
        );
        if (pa.id === pb.id) {
          await tx
            .update(pairingEntry)
            .set({ side: eb.side, position: eb.position })
            .where(and(eq(pairingEntry.pairingId, pa.id), eq(pairingEntry.entryId, ea.entryId)));
          await tx
            .update(pairingEntry)
            .set({ side: ea.side, position: ea.position })
            .where(and(eq(pairingEntry.pairingId, pa.id), eq(pairingEntry.entryId, eb.entryId)));
        } else {
          await tx
            .delete(pairingEntry)
            .where(and(eq(pairingEntry.pairingId, pa.id), eq(pairingEntry.entryId, ea.entryId)));
          await tx
            .delete(pairingEntry)
            .where(and(eq(pairingEntry.pairingId, pb.id), eq(pairingEntry.entryId, eb.entryId)));
          await tx.insert(pairingEntry).values([
            { pairingId: pa.id, entryId: eb.entryId, side: ea.side, position: ea.position },
            { pairingId: pb.id, entryId: ea.entryId, side: eb.side, position: eb.position },
          ]);
        }
        await tx
          .update(pairing)
          .set({ explain: null })
          .where(inArray(pairing.id, [pa.id, pb.id]));
        summary = "Swapped entries";
        break;
      }
      case "flipSides": {
        const p = get(op.pairingId);
        for (const e of p.entries) {
          if (!e.side) continue;
          await tx
            .update(pairingEntry)
            .set({ side: e.side === "A" ? "B" : "A" })
            .where(and(eq(pairingEntry.pairingId, p.id), eq(pairingEntry.entryId, e.entryId)));
        }
        await tx.update(pairing).set({ sidesPending: false }).where(eq(pairing.id, p.id));
        summary = "Flipped sides";
        break;
      }
      case "setSidesPending": {
        get(op.pairingId);
        await tx
          .update(pairing)
          .set({ sidesPending: op.pending })
          .where(eq(pairing.id, op.pairingId));
        summary = op.pending ? "Sides set to coin flip" : "Sides fixed";
        break;
      }
      case "setJudge": {
        const p = get(op.pairingId);
        // A judge can only sit on one panel per flight: move them if needed.
        const others = pairings.filter(
          (q) =>
            q.flight === p.flight &&
            q.id !== p.id &&
            q.judges.some((j) => j.judgeId === op.judgeId),
        );
        if (others.length) {
          await tx.delete(pairingJudge).where(
            and(
              inArray(
                pairingJudge.pairingId,
                others.map((o) => o.id),
              ),
              eq(pairingJudge.judgeId, op.judgeId),
            ),
          );
        }
        if (op.role === "chair" || op.role === "parliamentarian") {
          await tx
            .update(pairingJudge)
            .set({ role: op.role === "chair" ? "panelist" : "scorer" })
            .where(and(eq(pairingJudge.pairingId, p.id), eq(pairingJudge.role, op.role)));
        }
        await tx
          .insert(pairingJudge)
          .values({ pairingId: p.id, judgeId: op.judgeId, role: op.role })
          .onConflictDoUpdate({
            target: [pairingJudge.pairingId, pairingJudge.judgeId],
            set: { role: op.role },
          });
        summary = others.length ? "Moved a judge" : "Added a judge";
        break;
      }
      case "removeJudge": {
        await tx
          .delete(pairingJudge)
          .where(
            and(eq(pairingJudge.pairingId, op.pairingId), eq(pairingJudge.judgeId, op.judgeId)),
          );
        summary = "Removed a judge";
        break;
      }
      case "setRoom": {
        const p = get(op.pairingId);
        if (op.roomId) {
          const clash = pairings.find(
            (q) => q.id !== p.id && q.flight === p.flight && q.roomId === op.roomId,
          );
          if (clash)
            await tx.update(pairing).set({ roomId: p.roomId }).where(eq(pairing.id, clash.id));
        }
        await tx.update(pairing).set({ roomId: op.roomId }).where(eq(pairing.id, p.id));
        summary = "Changed room";
        break;
      }
      case "toggleLock": {
        const p = get(op.pairingId);
        await tx.update(pairing).set({ locked: !p.locked }).where(eq(pairing.id, p.id));
        summary = p.locked ? "Unlocked a debate" : "Locked a debate";
        break;
      }
      case "setFlight": {
        get(op.pairingId);
        await tx.update(pairing).set({ flight: op.flight }).where(eq(pairing.id, op.pairingId));
        summary = `Moved a debate to flight ${op.flight}`;
        break;
      }
      case "setForfeit": {
        const p = get(op.pairingId);
        if (op.entryId && !p.entries.some((e) => e.entryId === op.entryId))
          throw invalid("That entry isn't in this debate");
        await tx.update(pairing).set({ forfeitEntryId: op.entryId }).where(eq(pairing.id, p.id));
        summary = op.entryId ? "Recorded a forfeit" : "Cleared a forfeit";
        break;
      }
      case "moveEntry": {
        const from = pairings.find((p) => p.entries.some((e) => e.entryId === op.entryId));
        if (from) {
          await tx
            .delete(pairingEntry)
            .where(and(eq(pairingEntry.pairingId, from.id), eq(pairingEntry.entryId, op.entryId)));
          const remaining = from.entries.length - 1;
          if (remaining === 0) await tx.delete(pairing).where(eq(pairing.id, from.id));
          else
            await tx
              .update(pairing)
              .set({ bye: remaining === 1 && r.stage === "prelim" })
              .where(eq(pairing.id, from.id));
        }
        if (op.toPairingId) {
          const to = get(op.toPairingId);
          const used = new Set(to.entries.map((e) => e.side));
          const side: Side | null =
            to.entries.length === 0 ? "A" : used.has("A") ? (used.has("B") ? null : "B") : "A";
          await tx.insert(pairingEntry).values({
            pairingId: to.id,
            entryId: op.entryId,
            side: isCongress ? null : side,
            position: to.entries.length,
          });
          await tx.update(pairing).set({ bye: false }).where(eq(pairing.id, to.id));
        } else {
          const [p] = await tx
            .insert(pairing)
            .values({ roundId, sort: pairings.length, flight: 1, bye: true })
            .returning({ id: pairing.id });
          await tx
            .insert(pairingEntry)
            .values({ pairingId: p!.id, entryId: op.entryId, side: null, position: 0 });
        }
        summary = op.toPairingId ? "Moved an entry" : "Gave an entry a bye";
        break;
      }
    }

    const version = await bumpVersion(tx, roundId);
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: `round.edit.${op.type}`,
      entityType: "round",
      entityId: roundId,
      summary: `${r.label}: ${summary}`,
      before,
      after: serializePairings(await loadRoundPairings(tx, roundId)),
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
    return { version };
  });
}

/** Restores the draw as it was after (or before) a given audit entry. */
export async function revertRound(
  db: Db,
  actor: Actor,
  roundId: string,
  draw: SerializedPairing[],
) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    if (r.status !== "draft") throw invalid("Unpublish the round before reverting it");
    const before = serializePairings(await loadRoundPairings(tx, roundId));
    await tx.delete(pairing).where(eq(pairing.roundId, roundId));
    await writePairings(tx, roundId, draw);
    const version = await bumpVersion(tx, roundId);
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.revert",
      entityType: "round",
      entityId: roundId,
      summary: `Reverted ${r.label} (v${version})`,
      before,
      after: draw,
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
    return { version };
  });
}

// ---------------------------------------------------------------------------
// Checks & publishing
// ---------------------------------------------------------------------------

export async function checkRoundDraft(db: Queryable, roundId: string): Promise<Finding[]> {
  const r = await loadRound(db, roundId);
  const bundle = await loadEventBundle(db, r.eventId);
  const pairings = await loadRoundPairings(db, roundId);
  const { judges, busyJudgeIds } = await loadJudgesForRound(db, r);
  const { rooms, busyRoomIds } = await loadRoomsForRound(db, r);
  const cfg = bundle.config;
  const isCongress = cfg.format === "congress";
  const judging = isDebateConfig(cfg) ? cfg.judging : undefined;
  const roundsOwed = new Map(judges.map((j) => [j.id, j.roundsOwed ?? 0]));
  const prefs = judging ? await loadPrefs(db, r.eventId, judging, roundsOwed) : undefined;
  const results = isCongress
    ? []
    : await loadDebateResults(db, r.eventId, { beforeSeq: r.seq, stage: "all" });
  const prelimSeq = (await listRounds(db, r.eventId)).filter(
    (x) => x.stage === "prelim" && x.seq <= r.seq,
  ).length;

  // Elim rounds only contain the advancing entries.
  const pairedIds = new Set(pairings.flatMap((p) => p.entries.map((e) => e.entryId)));
  const entries =
    r.stage === "elim" ? bundle.entries.filter((e) => pairedIds.has(e.id)) : bundle.entries;

  const findings = checkRound(
    pairings.map((p) => ({
      key: p.id,
      label:
        p.label ??
        p.entries.map((e) => entries.find((x) => x.id === e.entryId)?.code ?? "?").join(" vs "),
      entries: p.entries.map((e) => ({ entryId: e.entryId, side: e.side })),
      judgeIds: p.judges.map((j) => j.judgeId),
      roomId: p.roomId,
      flight: p.flight,
      bye: p.bye,
    })),
    {
      entries,
      judges: judges.map((j) => ({ ...j, available: true })),
      rooms,
      results: results.filter((x) => x.stage === "prelim"),
      roundSeq: prelimSeq,
      config: isDebateConfig(cfg) ? cfg : undefined,
      judging: judging ?? {
        prelimPanelSize: 3,
        elimPanelSize: 3,
        prefs: "none",
        tiers: [],
        strikes: 0,
        maxPrefPercentile: 100,
        mutualityWeight: 1,
        allowSameSchool: false,
        avoidRepeatJudging: false,
        blockOutstandingBallots: false,
      },
      panelSize: r.panelSize,
      prefs,
      busyJudgeIds,
      busyRoomIds,
      kind: isCongress ? "congress" : "two_team",
    },
  );
  // Elims legitimately rematch prelim opponents.
  return r.stage === "elim" ? findings.filter((f) => f.code !== "rematch") : findings;
}

export interface PublishOptions {
  /** Publish despite blocking errors. */
  force?: boolean;
  notify?: boolean;
  /** Schedule publication for later. */
  at?: Date | null;
}

export async function publishRound(
  db: Db,
  actor: Actor,
  roundId: string,
  queue: JobQueue,
  opts: PublishOptions = {},
) {
  const findings = await checkRoundDraft(db, roundId);
  if (hasBlockingErrors(findings) && !opts.force) {
    throw new DomainError(
      "invalid",
      "Fix the errors before publishing, or publish anyway.",
      findings,
    );
  }
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    const pairings = await loadRoundPairings(tx, roundId);
    if (pairings.length === 0) throw invalid("Generate the round before publishing it");

    if (opts.at && opts.at.getTime() > Date.now()) {
      await tx.update(round).set({ scheduledPublishAt: opts.at }).where(eq(round.id, roundId));
      await queue.enqueue(
        "round.scheduledPublish",
        { tournamentId: r.tournamentId, roundId, version: r.version },
        { startAfter: opts.at },
      );
      await audit(tx, actor, {
        tournamentId: r.tournamentId,
        action: "round.schedule",
        entityType: "round",
        entityId: roundId,
        summary: `Scheduled ${r.label} for ${opts.at.toISOString()}`,
      });
      return { scheduled: true, findings };
    }

    await syncBallots(tx, pairings);
    await tx
      .update(round)
      .set({ status: "published", publishedAt: new Date(), scheduledPublishAt: null })
      .where(eq(round.id, roundId));
    const snapshot = await buildPairingsSnapshot(tx, roundId);
    await tx
      .insert(publishedSnapshot)
      .values({
        tournamentId: r.tournamentId,
        kind: "pairings",
        refId: roundId,
        version: r.version,
        data: snapshot,
      })
      .onConflictDoUpdate({
        target: [publishedSnapshot.kind, publishedSnapshot.refId],
        set: { data: snapshot, version: r.version, publishedAt: new Date() },
      });
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.publish",
      entityType: "round",
      entityId: roundId,
      summary: `Published ${r.label} (v${r.version})`,
    });
    await emit(tx, r.tournamentId, { type: "round.published", roundId, eventId: r.eventId });
    if (opts.notify !== false)
      await queue.enqueue("notify.round", {
        tournamentId: r.tournamentId,
        roundId,
        kind: "published",
      });
    return { scheduled: false, findings };
  });
}

/** Creates pending ballots for every scoring judge; removes stale unsubmitted ones. */
async function syncBallots(tx: Queryable, pairings: LoadedPairing[]) {
  const ids = pairings.map((p) => p.id);
  if (ids.length === 0) return;
  const existing = await tx.select().from(ballot).where(inArray(ballot.pairingId, ids));
  const wanted = new Set<string>();
  for (const p of pairings) {
    if (p.bye) continue;
    for (const j of p.judges) {
      if (j.role === "trainee") continue;
      wanted.add(`${p.id}:${j.judgeId}`);
    }
  }
  const have = new Set(existing.map((b) => `${b.pairingId}:${b.judgeId}`));
  const stale = existing.filter(
    (b) =>
      !wanted.has(`${b.pairingId}:${b.judgeId}`) &&
      (b.status === "pending" || b.status === "draft"),
  );
  if (stale.length)
    await tx.delete(ballot).where(
      inArray(
        ballot.id,
        stale.map((b) => b.id),
      ),
    );
  const toCreate = [...wanted].filter((k) => !have.has(k));
  if (toCreate.length) {
    await tx.insert(ballot).values(
      toCreate.map((k) => {
        const [pairingId, judgeId] = k.split(":") as [string, string];
        return { pairingId, judgeId, status: "pending" as const };
      }),
    );
  }
}

export async function republishIfPublished(tx: Queryable, roundId: string) {
  const r = await loadRound(tx, roundId);
  if (r.status === "draft") return;
  const snapshot = await buildPairingsSnapshot(tx, roundId);
  await tx
    .update(publishedSnapshot)
    .set({ data: snapshot, version: r.version, publishedAt: new Date() })
    .where(and(eq(publishedSnapshot.kind, "pairings"), eq(publishedSnapshot.refId, roundId)));
}

export async function unpublishRound(db: Db, actor: Actor, roundId: string) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    const submitted = await tx
      .select({ id: ballot.id })
      .from(ballot)
      .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
      .where(and(eq(pairing.roundId, roundId), inArray(ballot.status, ["submitted", "confirmed"])));
    if (submitted.length) throw invalid("Ballots have already been submitted for this round");
    await tx.update(round).set({ status: "draft", publishedAt: null }).where(eq(round.id, roundId));
    await tx
      .delete(publishedSnapshot)
      .where(and(eq(publishedSnapshot.kind, "pairings"), eq(publishedSnapshot.refId, roundId)));
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.unpublish",
      entityType: "round",
      entityId: roundId,
      summary: `Unpublished ${r.label}`,
    });
    await emit(tx, r.tournamentId, { type: "round.unpublished", roundId, eventId: r.eventId });
  });
}

export async function setRoundCompleted(db: Db, actor: Actor, roundId: string, completed: boolean) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    if (r.status === "draft") throw invalid("Publish the round first");
    await tx
      .update(round)
      .set({ status: completed ? "completed" : "published" })
      .where(eq(round.id, roundId));
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.complete",
      entityType: "round",
      entityId: roundId,
      summary: `${completed ? "Completed" : "Reopened"} ${r.label}`,
    });
    await emit(tx, r.tournamentId, { type: "round.updated", roundId, eventId: r.eventId });
  });
}

export async function releaseMotion(db: Db, actor: Actor, roundId: string, queue: JobQueue) {
  return db.transaction(async (tx) => {
    const r = await loadRound(tx, roundId);
    await requireRole(tx, actor, r.tournamentId, "tabber");
    if (!r.motion) throw invalid("Set a motion first");
    await tx.update(round).set({ motionReleased: true }).where(eq(round.id, roundId));
    await republishIfPublished(tx, roundId);
    await audit(tx, actor, {
      tournamentId: r.tournamentId,
      action: "round.motion",
      entityType: "round",
      entityId: roundId,
      summary: `Released motion for ${r.label}`,
    });
    await emit(tx, r.tournamentId, { type: "motion.released", roundId });
    await queue.enqueue("notify.round", { tournamentId: r.tournamentId, roundId, kind: "motion" });
  });
}

export async function setBallotsReleased(db: Db, actor: Actor, roundId: string, released: boolean) {
  const r = await loadRound(db, roundId);
  await requireRole(db, actor, r.tournamentId, "tabber");
  await db.update(round).set({ ballotsReleased: released }).where(eq(round.id, roundId));
  await audit(db, actor, {
    tournamentId: r.tournamentId,
    action: "round.release",
    entityType: "round",
    entityId: roundId,
    summary: `${released ? "Released" : "Hid"} ballots for ${r.label}`,
  });
}

/** Draw history from the audit log (for the version panel). */
export { loadRoundPairings };
