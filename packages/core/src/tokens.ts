import { randomBytes } from "node:crypto";
import { accessToken, type Db, entry, judge, type Queryable, tournament } from "@opentab/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "./actor";
import { audit } from "./audit";
import { requireRole } from "./authz";

/**
 * Private links: every judge and entry gets an unguessable URL that works
 * without an account (the #1 source of judge friction in legacy systems is
 * account linking). Links can be rotated or revoked at any time.
 */

export const newToken = (): string => randomBytes(18).toString("base64url");

/** Creates missing links for all judges and entries of a tournament. */
export async function ensureTokens(db: Db, actor: Actor, tournamentId: string): Promise<number> {
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "tabber");
    const existing = await tx
      .select({ subjectId: accessToken.subjectId })
      .from(accessToken)
      .where(and(eq(accessToken.tournamentId, tournamentId), isNull(accessToken.revokedAt)));
    const have = new Set(existing.map((e) => e.subjectId));
    const judges = await tx
      .select({ id: judge.id })
      .from(judge)
      .where(eq(judge.tournamentId, tournamentId));
    const entries = await tx
      .select({ id: entry.id })
      .from(entry)
      .where(eq(entry.tournamentId, tournamentId));
    const rows = [
      ...judges
        .filter((j) => !have.has(j.id))
        .map((j) => ({ subjectType: "judge" as const, subjectId: j.id })),
      ...entries
        .filter((e) => !have.has(e.id))
        .map((e) => ({ subjectType: "entry" as const, subjectId: e.id })),
    ];
    if (rows.length)
      await tx
        .insert(accessToken)
        .values(rows.map((r) => ({ ...r, tournamentId, token: newToken() })));
    return rows.length;
  });
}

export async function linksFor(
  db: Queryable,
  tournamentId: string,
  subjectType: "judge" | "entry",
) {
  return db
    .select({
      subjectId: accessToken.subjectId,
      token: accessToken.token,
      lastUsedAt: accessToken.lastUsedAt,
    })
    .from(accessToken)
    .where(
      and(
        eq(accessToken.tournamentId, tournamentId),
        eq(accessToken.subjectType, subjectType),
        isNull(accessToken.revokedAt),
      ),
    );
}

export async function tokenFor(
  db: Queryable,
  subjectType: "judge" | "entry",
  subjectId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ token: accessToken.token })
    .from(accessToken)
    .where(
      and(
        eq(accessToken.subjectType, subjectType),
        eq(accessToken.subjectId, subjectId),
        isNull(accessToken.revokedAt),
      ),
    );
  return row?.token ?? null;
}

export async function rotateToken(
  db: Db,
  actor: Actor,
  tournamentId: string,
  subjectType: "judge" | "entry",
  subjectId: string,
) {
  return db.transaction(async (tx) => {
    await requireRole(tx, actor, tournamentId, "tabber");
    await tx
      .update(accessToken)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(accessToken.subjectType, subjectType),
          eq(accessToken.subjectId, subjectId),
          isNull(accessToken.revokedAt),
        ),
      );
    const token = newToken();
    await tx.insert(accessToken).values({ tournamentId, subjectType, subjectId, token });
    await audit(tx, actor, {
      tournamentId,
      action: "link.rotate",
      entityType: subjectType,
      entityId: subjectId,
      summary: `Reset a ${subjectType}'s private link`,
    });
    return token;
  });
}

export interface ResolvedToken {
  tournamentId: string;
  tournamentSlug: string;
  tournamentName: string;
  subjectType: "judge" | "entry";
  subjectId: string;
  name: string;
}

/** Resolves a private link, or null if unknown/revoked/expired. */
export async function resolveToken(db: Queryable, token: string): Promise<ResolvedToken | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [row] = await db
    .select({ tok: accessToken, slug: tournament.slug, tname: tournament.name })
    .from(accessToken)
    .innerJoin(tournament, eq(tournament.id, accessToken.tournamentId))
    .where(eq(accessToken.token, token));
  if (!row || row.tok.revokedAt || (row.tok.expiresAt && row.tok.expiresAt < new Date()))
    return null;
  let name = "";
  if (row.tok.subjectType === "judge") {
    const [j] = await db
      .select({ name: judge.name })
      .from(judge)
      .where(eq(judge.id, row.tok.subjectId));
    if (!j) return null;
    name = j.name;
  } else {
    const [e] = await db
      .select({ code: entry.code })
      .from(entry)
      .where(eq(entry.id, row.tok.subjectId));
    if (!e) return null;
    name = e.code;
  }
  // Best-effort usage stamp (at most once a minute).
  if (!row.tok.lastUsedAt || Date.now() - row.tok.lastUsedAt.getTime() > 60_000) {
    await db
      .update(accessToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(accessToken.id, row.tok.id));
  }
  return {
    tournamentId: row.tok.tournamentId,
    tournamentSlug: row.slug,
    tournamentName: row.tname,
    subjectType: row.tok.subjectType,
    subjectId: row.tok.subjectId,
    name,
  };
}

export function tokenActor(t: ResolvedToken): Actor {
  return {
    kind: "token",
    tournamentId: t.tournamentId,
    subjectType: t.subjectType,
    subjectId: t.subjectId,
    name: t.name,
  };
}

export async function subjectsByIds(db: Queryable, judgeIds: string[]) {
  if (!judgeIds.length) return [];
  return db.select().from(judge).where(inArray(judge.id, judgeIds));
}
