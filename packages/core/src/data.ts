import {
  competitor,
  conflict,
  type Db,
  entry,
  event,
  judge,
  judgeBlock,
  judgePool,
  judgePoolMember,
  type Queryable,
  room,
  roomBlock,
  school,
} from "@opentab/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireRole } from "./authz";
import { assertFound, invalid } from "./errors";
import { assertInTournament } from "./tenancy";

/**
 * Tournament data management: schools, entries, competitors, judges, rooms,
 * conflicts. All writes require at least the "tabber" role and are audited.
 */

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function listSchools(db: Queryable, tournamentId: string) {
  return db
    .select()
    .from(school)
    .where(eq(school.tournamentId, tournamentId))
    .orderBy(asc(school.name));
}

export async function listEntries(db: Queryable, tournamentId: string, eventId?: string) {
  const conds = [eq(entry.tournamentId, tournamentId)];
  if (eventId) conds.push(eq(entry.eventId, eventId));
  const rows = await db
    .select({
      entry,
      schoolName: school.name,
      schoolCode: school.code,
      eventAbbr: event.abbreviation,
    })
    .from(entry)
    .leftJoin(school, eq(school.id, entry.schoolId))
    .innerJoin(event, eq(event.id, entry.eventId))
    .where(and(...conds))
    .orderBy(asc(entry.code));
  const ids = rows.map((r) => r.entry.id);
  const comps = ids.length
    ? await db
        .select()
        .from(competitor)
        .where(inArray(competitor.entryId, ids))
        .orderBy(asc(competitor.sort))
    : [];
  const byEntry = new Map<string, (typeof comps)[number][]>();
  for (const c of comps) byEntry.set(c.entryId, [...(byEntry.get(c.entryId) ?? []), c]);
  return rows.map((r) => ({
    ...r.entry,
    schoolName: r.schoolName,
    schoolCode: r.schoolCode,
    eventAbbr: r.eventAbbr,
    competitors: byEntry.get(r.entry.id) ?? [],
  }));
}

export async function listJudges(db: Queryable, tournamentId: string) {
  const rows = await db
    .select({ judge, schoolName: school.name, schoolCode: school.code })
    .from(judge)
    .leftJoin(school, eq(school.id, judge.schoolId))
    .where(eq(judge.tournamentId, tournamentId))
    .orderBy(asc(judge.name));
  return rows.map((r) => ({ ...r.judge, schoolName: r.schoolName, schoolCode: r.schoolCode }));
}

export async function listRooms(db: Queryable, tournamentId: string) {
  return db.select().from(room).where(eq(room.tournamentId, tournamentId)).orderBy(asc(room.name));
}

export async function listConflicts(db: Queryable, tournamentId: string) {
  return db
    .select({
      conflict,
      judgeName: judge.name,
      entryCode: entry.code,
      schoolName: school.name,
    })
    .from(conflict)
    .innerJoin(judge, eq(judge.id, conflict.judgeId))
    .leftJoin(entry, eq(entry.id, conflict.entryId))
    .leftJoin(school, eq(school.id, conflict.schoolId))
    .where(eq(conflict.tournamentId, tournamentId));
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const trimmed = (max = 200) => z.string().trim().min(1).max(max);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const schoolInput = z.object({
  name: trimmed(),
  code: trimmed(20),
  region: optionalText(40),
  contactEmail: optionalText(200),
});

export const entryInput = z.object({
  eventId: z.uuid(),
  schoolId: z.uuid().nullable().optional(),
  code: trimmed(60),
  name: trimmed(),
  status: z.enum(["active", "dropped", "waitlisted"]).default("active"),
  seed: z.number().int().positive().nullable().optional(),
  requiresAccessible: z.boolean().default(false),
  notes: optionalText(2000),
  competitors: z
    .array(
      z.object({
        name: trimmed(),
        email: optionalText(200),
        pronouns: optionalText(40),
        hidePublic: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(8),
});

export const judgeInput = z.object({
  name: trimmed(),
  email: optionalText(200),
  schoolId: z.uuid().nullable().optional(),
  roundsOwed: z.number().int().min(0).max(30).default(0),
  rating: z.number().int().min(0).max(10).default(5),
  paradigm: optionalText(20000),
  active: z.boolean().default(true),
  trainee: z.boolean().default(false),
  notes: optionalText(2000),
});

export const roomInput = z.object({
  name: trimmed(80),
  building: optionalText(80),
  capacity: z.number().int().positive().nullable().optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  accessible: z.boolean().default(false),
  onlineUrl: optionalText(500),
  active: z.boolean().default(true),
});

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

type Kind = "school" | "entry" | "judge" | "room";

async function guard(db: Queryable, actor: Actor, tournamentId: string) {
  await requireRole(db, actor, tournamentId, "tabber");
}

export async function saveSchool(
  db: Db,
  actor: Actor,
  tournamentId: string,
  raw: z.input<typeof schoolInput> & { id?: string },
) {
  const input = schoolInput.parse(raw);
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    const row = raw.id
      ? (
          await tx
            .update(school)
            .set(input)
            .where(and(eq(school.id, raw.id), eq(school.tournamentId, tournamentId)))
            .returning()
        )[0]
      : (
          await tx
            .insert(school)
            .values({ ...input, tournamentId })
            .returning()
        )[0];
    const saved = assertFound(row, "School");
    await auditSave(
      tx,
      actor,
      tournamentId,
      "school",
      saved.id,
      raw.id ? "Updated" : "Added",
      saved.name,
    );
    return saved;
  });
}

export async function saveEntry(
  db: Db,
  actor: Actor,
  tournamentId: string,
  raw: z.input<typeof entryInput> & { id?: string },
) {
  const input = entryInput.parse(raw);
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    const [ev] = await tx
      .select()
      .from(event)
      .where(and(eq(event.id, input.eventId), eq(event.tournamentId, tournamentId)));
    if (!ev) throw invalid("Unknown event");
    await assertInTournament(tx, tournamentId, { schoolIds: [input.schoolId] });
    const { competitors, ...fields } = input;
    const values = { ...fields, schoolId: fields.schoolId ?? null, seed: fields.seed ?? null };
    const row = raw.id
      ? (
          await tx
            .update(entry)
            .set(values)
            .where(and(eq(entry.id, raw.id), eq(entry.tournamentId, tournamentId)))
            .returning()
        )[0]
      : (
          await tx
            .insert(entry)
            .values({ ...values, tournamentId })
            .returning()
        )[0];
    const saved = assertFound(row, "Entry");
    // Replace competitors, preserving ids where the name is unchanged (keeps scores linked).
    const existing = await tx
      .select()
      .from(competitor)
      .where(eq(competitor.entryId, saved.id))
      .orderBy(asc(competitor.sort));
    for (const [i, c] of competitors.entries()) {
      const match = existing[i];
      if (match) {
        await tx
          .update(competitor)
          .set({ ...c, sort: i })
          .where(eq(competitor.id, match.id));
      } else {
        await tx.insert(competitor).values({ ...c, entryId: saved.id, sort: i });
      }
    }
    const extra = existing.slice(competitors.length).map((c) => c.id);
    if (extra.length) await tx.delete(competitor).where(inArray(competitor.id, extra));
    await auditSave(
      tx,
      actor,
      tournamentId,
      "entry",
      saved.id,
      raw.id ? "Updated" : "Added",
      saved.code,
    );
    return saved;
  });
}

export async function setEntryStatus(
  db: Db,
  actor: Actor,
  tournamentId: string,
  entryId: string,
  status: "active" | "dropped" | "waitlisted",
) {
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    const [row] = await tx
      .update(entry)
      .set({ status })
      .where(and(eq(entry.id, entryId), eq(entry.tournamentId, tournamentId)))
      .returning();
    const saved = assertFound(row, "Entry");
    await audit(tx, actor, {
      tournamentId,
      action: "entry.status",
      entityType: "entry",
      entityId: entryId,
      summary: `${saved.code} is now ${status}`,
    });
    return saved;
  });
}

export async function saveJudge(
  db: Db,
  actor: Actor,
  tournamentId: string,
  raw: z.input<typeof judgeInput> & { id?: string },
) {
  const input = judgeInput.parse(raw);
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    await assertInTournament(tx, tournamentId, { schoolIds: [input.schoolId] });
    const values = { ...input, schoolId: input.schoolId ?? null };
    const row = raw.id
      ? (
          await tx
            .update(judge)
            .set(values)
            .where(and(eq(judge.id, raw.id), eq(judge.tournamentId, tournamentId)))
            .returning()
        )[0]
      : (
          await tx
            .insert(judge)
            .values({ ...values, tournamentId })
            .returning()
        )[0];
    const saved = assertFound(row, "Judge");
    await auditSave(
      tx,
      actor,
      tournamentId,
      "judge",
      saved.id,
      raw.id ? "Updated" : "Added",
      saved.name,
    );
    return saved;
  });
}

export async function saveRoom(
  db: Db,
  actor: Actor,
  tournamentId: string,
  raw: z.input<typeof roomInput> & { id?: string },
) {
  const input = roomInput.parse(raw);
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    const values = { ...input, capacity: input.capacity ?? null };
    const row = raw.id
      ? (
          await tx
            .update(room)
            .set(values)
            .where(and(eq(room.id, raw.id), eq(room.tournamentId, tournamentId)))
            .returning()
        )[0]
      : (
          await tx
            .insert(room)
            .values({ ...values, tournamentId })
            .returning()
        )[0];
    const saved = assertFound(row, "Room");
    await auditSave(
      tx,
      actor,
      tournamentId,
      "room",
      saved.id,
      raw.id ? "Updated" : "Added",
      saved.name,
    );
    return saved;
  });
}

const tables = { school, entry, judge, room } as const;

export async function deleteRecord(
  db: Db,
  actor: Actor,
  tournamentId: string,
  kind: Kind,
  id: string,
) {
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    const table = tables[kind];
    const deleted = await tx
      .delete(table)
      .where(and(eq(table.id, id), eq(table.tournamentId, tournamentId)))
      .returning();
    if (deleted.length === 0) throw invalid(`${kind} not found`);
    await audit(tx, actor, {
      tournamentId,
      action: `${kind}.delete`,
      entityType: kind,
      entityId: id,
      summary: `Deleted ${kind}`,
      before: deleted[0],
    });
  });
}

async function auditSave(
  tx: Queryable,
  actor: Actor,
  tournamentId: string,
  kind: Kind,
  id: string,
  verb: string,
  label: string,
) {
  await audit(tx, actor, {
    tournamentId,
    action: `${kind}.save`,
    entityType: kind,
    entityId: id,
    summary: `${verb} ${kind} ${label}`,
  });
}

export const conflictInput = z.object({
  judgeId: z.uuid(),
  entryId: z.uuid().nullable().optional(),
  schoolId: z.uuid().nullable().optional(),
  kind: z.enum(["conflict", "strike"]).default("conflict"),
  source: z.enum(["tab", "judge", "entry"]).default("tab"),
});

export async function addConflict(
  db: Db,
  actor: Actor,
  tournamentId: string,
  raw: z.input<typeof conflictInput>,
) {
  const input = conflictInput.parse(raw);
  if (!input.entryId && !input.schoolId) throw invalid("A conflict needs an entry or a school");
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    await assertInTournament(tx, tournamentId, {
      judgeIds: [input.judgeId],
      entryIds: [input.entryId],
      schoolIds: [input.schoolId],
    });
    const [row] = await tx
      .insert(conflict)
      .values({
        ...input,
        entryId: input.entryId ?? null,
        schoolId: input.schoolId ?? null,
        tournamentId,
      })
      .returning();
    await audit(tx, actor, {
      tournamentId,
      action: "conflict.add",
      entityType: "conflict",
      entityId: row!.id,
      summary: "Added a judge conflict",
    });
    return row!;
  });
}

export async function removeConflict(db: Db, actor: Actor, tournamentId: string, id: string) {
  await guard(db, actor, tournamentId);
  await db
    .delete(conflict)
    .where(and(eq(conflict.id, id), eq(conflict.tournamentId, tournamentId)));
}

export async function setJudgeBlocks(
  db: Db,
  actor: Actor,
  tournamentId: string,
  judgeId: string,
  timeslotIds: string[],
) {
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    await assertInTournament(tx, tournamentId, { judgeIds: [judgeId] });
    await tx.delete(judgeBlock).where(eq(judgeBlock.judgeId, judgeId));
    if (timeslotIds.length)
      await tx.insert(judgeBlock).values(timeslotIds.map((t) => ({ judgeId, timeslotId: t })));
  });
}

export async function setRoomBlocks(
  db: Db,
  actor: Actor,
  tournamentId: string,
  roomId: string,
  timeslotIds: string[],
) {
  return db.transaction(async (tx) => {
    await guard(tx, actor, tournamentId);
    await assertInTournament(tx, tournamentId, { roomIds: [roomId] });
    await tx.delete(roomBlock).where(eq(roomBlock.roomId, roomId));
    if (timeslotIds.length)
      await tx.insert(roomBlock).values(timeslotIds.map((t) => ({ roomId, timeslotId: t })));
  });
}

export async function checkInJudge(
  db: Db,
  actor: Actor,
  tournamentId: string,
  judgeId: string,
  checkedIn: boolean,
) {
  await guard(db, actor, tournamentId);
  await db
    .update(judge)
    .set({ checkedInAt: checkedIn ? new Date() : null })
    .where(and(eq(judge.id, judgeId), eq(judge.tournamentId, tournamentId)));
}

export async function createJudgePool(
  db: Db,
  actor: Actor,
  tournamentId: string,
  name: string,
  judgeIds: string[],
) {
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "director");
    await assertInTournament(tx, tournamentId, { judgeIds });
    const [pool] = await tx.insert(judgePool).values({ tournamentId, name }).returning();
    if (judgeIds.length)
      await tx
        .insert(judgePoolMember)
        .values(judgeIds.map((j) => ({ poolId: pool!.id, judgeId: j })));
    return pool!;
  });
}
