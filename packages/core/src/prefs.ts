import {
  conflict,
  type Db,
  entry,
  judge,
  judgePoolMember,
  pref,
  prefSheet,
  type Queryable,
} from "@opentab/db";
import { type Finding, isDebateConfig, validatePrefSheet } from "@opentab/engine";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "./actor";
import { getRole, roleAtLeast } from "./authz";
import { DomainError, forbidden, invalid } from "./errors";
import { loadEventBundle } from "./loaders";

/** Pref sheet for an entry: the judges they may rate, plus their saved prefs. */
export async function getPrefSheet(db: Queryable, entryId: string) {
  const [e] = await db.select().from(entry).where(eq(entry.id, entryId));
  if (!e) throw invalid("Entry not found");
  const bundle = await loadEventBundle(db, e.eventId);
  if (!isDebateConfig(bundle.config)) throw invalid("This event doesn't use prefs");
  const settings = bundle.config.judging;
  let judges = await db
    .select()
    .from(judge)
    .where(and(eq(judge.tournamentId, e.tournamentId), eq(judge.active, true)))
    .orderBy(asc(judge.name));
  if (bundle.event.judgePoolId) {
    const members = new Set(
      (
        await db
          .select()
          .from(judgePoolMember)
          .where(eq(judgePoolMember.poolId, bundle.event.judgePoolId))
      ).map((m) => m.judgeId),
    );
    judges = judges.filter((j) => members.has(j.id));
  }
  // Own-school judges and conflicted judges are excluded from the sheet.
  const conflicts = await db.select().from(conflict).where(eq(conflict.entryId, entryId));
  const conflicted = new Set(conflicts.filter((c) => c.kind === "conflict").map((c) => c.judgeId));
  judges = judges.filter(
    (j) => !j.trainee && !(e.schoolId && j.schoolId === e.schoolId) && !conflicted.has(j.id),
  );
  const [sheet] = await db.select().from(prefSheet).where(eq(prefSheet.entryId, entryId));
  const prefs = sheet ? await db.select().from(pref).where(eq(pref.sheetId, sheet.id)) : [];
  return {
    entry: e,
    event: bundle.event,
    settings,
    submittedAt: sheet?.submittedAt ?? null,
    judges: judges.map((j) => ({
      id: j.id,
      name: j.name,
      roundsOwed: j.roundsOwed,
      paradigm: j.paradigm,
      schoolId: j.schoolId,
    })),
    prefs: prefs.map((p) => ({
      judgeId: p.judgeId,
      ordinal: p.ordinal,
      tier: p.tier,
      strike: p.strike,
    })),
  };
}

export const prefsInput = z.object({
  prefs: z.array(
    z.object({
      judgeId: z.uuid(),
      ordinal: z.number().int().min(1).nullable().optional(),
      tier: z.number().int().min(1).max(10).nullable().optional(),
      strike: z.boolean().default(false),
    }),
  ),
  submit: z.boolean().default(false),
});

export async function savePrefSheet(
  db: Db,
  actor: Actor,
  entryId: string,
  raw: z.input<typeof prefsInput>,
): Promise<{ findings: Finding[] }> {
  const input = prefsInput.parse(raw);
  return db.transaction(async (tx) => {
    const sheet = await getPrefSheet(tx, entryId);
    if (actor.kind === "token") {
      if (actor.subjectType !== "entry" || actor.subjectId !== entryId) throw forbidden();
    } else {
      const role = await getRole(tx, actor, sheet.entry.tournamentId);
      if (!role || !roleAtLeast(role, "tabber")) throw forbidden();
    }
    const judgeIds = sheet.judges.map((j) => j.id);
    const owed = new Map(sheet.judges.map((j) => [j.id, j.roundsOwed]));
    const findings = validatePrefSheet(input.prefs, judgeIds, sheet.settings, owed);
    if (input.submit && findings.some((f) => f.severity === "error")) {
      throw new DomainError("invalid", "Your pref sheet has problems", findings);
    }
    const [existing] = await tx.select().from(prefSheet).where(eq(prefSheet.entryId, entryId));
    const sheetId =
      existing?.id ??
      (await tx.insert(prefSheet).values({ entryId }).returning({ id: prefSheet.id }))[0]!.id;
    await tx.delete(pref).where(eq(pref.sheetId, sheetId));
    const valid = input.prefs.filter((p) => judgeIds.includes(p.judgeId));
    if (valid.length) {
      await tx.insert(pref).values(
        valid.map((p) => ({
          sheetId,
          judgeId: p.judgeId,
          ordinal: p.ordinal ?? null,
          tier: p.tier ?? null,
          strike: p.strike,
        })),
      );
    }
    await tx
      .update(prefSheet)
      .set({ submittedAt: input.submit ? new Date() : (existing?.submittedAt ?? null) })
      .where(eq(prefSheet.id, sheetId));
    return { findings };
  });
}
