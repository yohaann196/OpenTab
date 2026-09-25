import {
  type Db,
  event,
  judgePool,
  type Queryable,
  type TournamentSettings,
  timeslot,
  tournament,
  tournamentMember,
  user,
} from "@opentab/db";
import {
  type EventConfig,
  eventConfigSchema,
  FORMATS,
  type Format,
  presetFor,
} from "@opentab/engine";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { type Role, requireRole } from "./authz";
import { assertFound, DomainError, forbidden, invalid } from "./errors";
import { emit } from "./realtime";
import { assertInTournament } from "./tenancy";

export const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const createTournamentSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    slug: slugSchema,
    timezone: z.string().min(1).default("America/Chicago"),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    location: z.string().trim().max(200).optional(),
    visibility: z.enum(["public", "unlisted", "private"]).default("public"),
    events: z
      .array(
        z.object({
          format: z.enum(FORMATS),
          name: z.string().trim().min(1).max(80),
          abbreviation: z.string().trim().min(1).max(12),
        }),
      )
      .max(30)
      .default([]),
    timeslots: z.number().int().min(0).max(20).default(0),
  })
  .refine((v) => v.endsOn >= v.startsOn, {
    message: "End date must be on or after start date",
    path: ["endsOn"],
  });

export type CreateTournamentInput = z.input<typeof createTournamentSchema>;

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48)
    .replace(/-$/, "");
}

export async function isSlugAvailable(db: Queryable, slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tournament.id })
    .from(tournament)
    .where(eq(tournament.slug, slug));
  return !row;
}

export async function createTournament(db: Db, actor: Actor, raw: CreateTournamentInput) {
  if (actor.kind !== "user") throw forbidden("Sign in to create a tournament");
  const input = createTournamentSchema.parse(raw);
  return db.transaction(async (tx) => {
    if (!(await isSlugAvailable(tx, input.slug))) {
      throw new DomainError("conflict", "That tournament URL is taken");
    }
    const [t] = await tx
      .insert(tournament)
      .values({
        name: input.name,
        slug: input.slug,
        timezone: input.timezone,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        location: input.location,
        visibility: input.visibility,
        settings: {
          showJudges: true,
          codesOnly: false,
          publicStandings: false,
          releaseBallots: true,
        },
        createdBy: actor.userId,
      })
      .returning();
    await tx
      .insert(tournamentMember)
      .values({ tournamentId: t!.id, userId: actor.userId, role: "owner" });
    for (const [i, ev] of input.events.entries()) {
      await tx.insert(event).values({
        tournamentId: t!.id,
        name: ev.name,
        abbreviation: ev.abbreviation,
        format: ev.format,
        config: presetFor(ev.format),
        sort: i,
      });
    }
    for (let i = 0; i < input.timeslots; i++) {
      await tx.insert(timeslot).values({ tournamentId: t!.id, label: `Round ${i + 1}`, sort: i });
    }
    await audit(tx, actor, {
      tournamentId: t!.id,
      action: "tournament.create",
      entityType: "tournament",
      entityId: t!.id,
      summary: `Created ${input.name}`,
    });
    return t!;
  });
}

export async function getTournamentBySlug(db: Queryable, slug: string) {
  const [t] = await db.select().from(tournament).where(eq(tournament.slug, slug));
  return t ?? null;
}

export async function requireTournamentBySlug(db: Queryable, slug: string) {
  return assertFound(await getTournamentBySlug(db, slug), "Tournament");
}

/** Tournaments the user is staff on, newest first. */
export async function listMyTournaments(db: Queryable, userId: string) {
  return db
    .select({
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      startsOn: tournament.startsOn,
      endsOn: tournament.endsOn,
      status: tournament.status,
      location: tournament.location,
      role: tournamentMember.role,
    })
    .from(tournamentMember)
    .innerJoin(tournament, eq(tournament.id, tournamentMember.tournamentId))
    .where(eq(tournamentMember.userId, userId))
    .orderBy(desc(tournament.startsOn));
}

/** Public tournaments, optionally filtered by a search string. */
export async function listPublicTournaments(
  db: Queryable,
  opts: { q?: string; limit?: number } = {},
) {
  const conds = [eq(tournament.visibility, "public")];
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "")}%`;
    conds.push(or(ilike(tournament.name, like), ilike(tournament.location, like))!);
  }
  return db
    .select({
      id: tournament.id,
      slug: tournament.slug,
      name: tournament.name,
      startsOn: tournament.startsOn,
      endsOn: tournament.endsOn,
      status: tournament.status,
      location: tournament.location,
    })
    .from(tournament)
    .where(and(...conds))
    .orderBy(desc(tournament.startsOn))
    .limit(opts.limit ?? 50);
}

export const tournamentUpdateSchema = z.object({
  name: z.string().trim().min(3).max(120).optional(),
  timezone: z.string().optional(),
  startsOn: z.iso.date().optional(),
  endsOn: z.iso.date().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  status: z.enum(["setup", "live", "completed", "archived"]).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  settings: z
    .object({
      codesOnly: z.boolean(),
      showJudges: z.boolean(),
      releaseBallots: z.boolean(),
      publicStandings: z.boolean(),
      announcement: z.string().max(2000),
    })
    .partial()
    .optional(),
});

export async function updateTournament(
  db: Db,
  actor: Actor,
  tournamentId: string,
  raw: z.input<typeof tournamentUpdateSchema>,
) {
  const input = tournamentUpdateSchema.parse(raw);
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "director");
    const [before] = await tx.select().from(tournament).where(eq(tournament.id, tournamentId));
    const settings: TournamentSettings | undefined = input.settings
      ? { ...(before!.settings ?? {}), ...input.settings }
      : undefined;
    const [after] = await tx
      .update(tournament)
      .set({ ...input, settings })
      .where(eq(tournament.id, tournamentId))
      .returning();
    await audit(tx, actor, {
      tournamentId,
      action: "tournament.update",
      entityType: "tournament",
      entityId: tournamentId,
      summary: "Updated tournament settings",
      before,
      after,
    });
    await emit(tx, tournamentId, { type: "tournament.updated" });
    return after!;
  });
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export async function listEvents(db: Queryable, tournamentId: string) {
  return db
    .select()
    .from(event)
    .where(eq(event.tournamentId, tournamentId))
    .orderBy(asc(event.sort), asc(event.name));
}

export async function getEvent(db: Queryable, eventId: string) {
  const [e] = await db.select().from(event).where(eq(event.id, eventId));
  return assertFound(e, "Event");
}

export async function addEvent(
  db: Db,
  actor: Actor,
  tournamentId: string,
  input: { format: Format; name: string; abbreviation: string },
) {
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "director");
    const existing = await listEvents(tx, tournamentId);
    const [row] = await tx
      .insert(event)
      .values({
        tournamentId,
        format: input.format,
        name: input.name.trim(),
        abbreviation: input.abbreviation.trim(),
        config: presetFor(input.format),
        sort: existing.length,
      })
      .returning();
    await audit(tx, actor, {
      tournamentId,
      action: "event.create",
      entityType: "event",
      entityId: row!.id,
      summary: `Added event ${row!.name}`,
    });
    return row!;
  });
}

export async function updateEventConfig(
  db: Db,
  actor: Actor,
  eventId: string,
  patch: { name?: string; abbreviation?: string; config?: unknown; judgePoolId?: string | null },
) {
  return db.transaction(async (tx) => {
    const ev = await getEvent(tx, eventId);
    await requireRole(tx, actor, ev.tournamentId, "director");
    await assertInTournament(tx, ev.tournamentId, { poolIds: [patch.judgePoolId] });
    let config: EventConfig | undefined;
    if (patch.config !== undefined) {
      const parsed = eventConfigSchema.safeParse(patch.config);
      if (!parsed.success) {
        throw invalid(
          "Invalid event configuration",
          parsed.error.issues.map((i) => ({
            code: "config",
            severity: "error" as const,
            message: `${i.path.join(".")}: ${i.message}`,
          })),
        );
      }
      if (parsed.data.format !== ev.format) throw invalid("An event's format cannot be changed");
      config = parsed.data;
    }
    const [after] = await tx
      .update(event)
      .set({
        name: patch.name?.trim() ?? undefined,
        abbreviation: patch.abbreviation?.trim() ?? undefined,
        config,
        judgePoolId: patch.judgePoolId,
      })
      .where(eq(event.id, eventId))
      .returning();
    await audit(tx, actor, {
      tournamentId: ev.tournamentId,
      action: "event.update",
      entityType: "event",
      entityId: eventId,
      summary: `Updated ${after!.name} settings`,
      before: ev,
      after,
    });
    return after!;
  });
}

export async function deleteEvent(db: Db, actor: Actor, eventId: string) {
  return db.transaction(async (tx) => {
    const ev = await getEvent(tx, eventId);
    await requireRole(tx, actor, ev.tournamentId, "director");
    await tx.delete(event).where(eq(event.id, eventId));
    await audit(tx, actor, {
      tournamentId: ev.tournamentId,
      action: "event.delete",
      entityType: "event",
      entityId: eventId,
      summary: `Deleted event ${ev.name}`,
      before: ev,
    });
  });
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export async function listMembers(db: Queryable, tournamentId: string) {
  return db
    .select({ userId: user.id, name: user.name, email: user.email, role: tournamentMember.role })
    .from(tournamentMember)
    .innerJoin(user, eq(user.id, tournamentMember.userId))
    .where(eq(tournamentMember.tournamentId, tournamentId))
    .orderBy(asc(user.name));
}

/** Adds (or updates) a staff member by email. The user must already have an account. */
export async function setMember(
  db: Db,
  actor: Actor,
  tournamentId: string,
  email: string,
  role: Role,
) {
  return db.transaction(async (tx) => {
    const myRole = await requireRole(tx, actor, tournamentId, "director");
    if (role === "owner" && myRole !== "owner") throw forbidden("Only owners can add owners");
    const [u] = await tx.select().from(user).where(eq(user.email, email.trim().toLowerCase()));
    if (!u) throw invalid("No OpenTab account uses that email yet. Ask them to sign up first.");
    await tx
      .insert(tournamentMember)
      .values({ tournamentId, userId: u.id, role })
      .onConflictDoUpdate({
        target: [tournamentMember.tournamentId, tournamentMember.userId],
        set: { role },
      });
    await audit(tx, actor, {
      tournamentId,
      action: "member.set",
      entityType: "member",
      entityId: u.id,
      summary: `${u.name} is now ${role}`,
    });
  });
}

export async function removeMember(db: Db, actor: Actor, tournamentId: string, userId: string) {
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "director");
    const owners = await tx
      .select()
      .from(tournamentMember)
      .where(
        and(eq(tournamentMember.tournamentId, tournamentId), eq(tournamentMember.role, "owner")),
      );
    if (owners.length === 1 && owners[0]!.userId === userId)
      throw invalid("A tournament needs at least one owner");
    await tx
      .delete(tournamentMember)
      .where(
        and(eq(tournamentMember.tournamentId, tournamentId), eq(tournamentMember.userId, userId)),
      );
    await audit(tx, actor, {
      tournamentId,
      action: "member.remove",
      entityType: "member",
      entityId: userId,
      summary: "Removed a staff member",
    });
  });
}

// ---------------------------------------------------------------------------
// Judge pools & timeslots
// ---------------------------------------------------------------------------

export async function listTimeslots(db: Queryable, tournamentId: string) {
  return db
    .select()
    .from(timeslot)
    .where(eq(timeslot.tournamentId, tournamentId))
    .orderBy(asc(timeslot.sort), asc(timeslot.startsAt));
}

export async function upsertTimeslot(
  db: Db,
  actor: Actor,
  tournamentId: string,
  input: {
    id?: string;
    label: string;
    startsAt?: Date | null;
    endsAt?: Date | null;
    sort?: number;
  },
) {
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "director");
    if (input.id) {
      const [row] = await tx
        .update(timeslot)
        .set({
          label: input.label,
          startsAt: input.startsAt ?? null,
          endsAt: input.endsAt ?? null,
          sort: input.sort,
        })
        .where(and(eq(timeslot.id, input.id), eq(timeslot.tournamentId, tournamentId)))
        .returning();
      return assertFound(row, "Timeslot");
    }
    const existing = await listTimeslots(tx, tournamentId);
    const [row] = await tx
      .insert(timeslot)
      .values({
        tournamentId,
        label: input.label,
        startsAt: input.startsAt ?? null,
        endsAt: input.endsAt ?? null,
        sort: input.sort ?? existing.length,
      })
      .returning();
    return row!;
  });
}

export async function deleteTimeslot(db: Db, actor: Actor, tournamentId: string, id: string) {
  await requireRole(db, actor, tournamentId, "director");
  await db
    .delete(timeslot)
    .where(and(eq(timeslot.id, id), eq(timeslot.tournamentId, tournamentId)));
}

export async function listJudgePools(db: Queryable, tournamentId: string) {
  return db
    .select()
    .from(judgePool)
    .where(eq(judgePool.tournamentId, tournamentId))
    .orderBy(asc(judgePool.name));
}

export async function tournamentsByIds(db: Queryable, ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(tournament).where(inArray(tournament.id, ids));
}
