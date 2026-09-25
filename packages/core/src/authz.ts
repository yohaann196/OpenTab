import { type Queryable, tournamentMember } from "@opentab/db";
import { and, eq } from "drizzle-orm";
import type { Actor } from "./actor";
import { forbidden } from "./errors";

export type Role = "owner" | "director" | "tabber" | "checker" | "viewer";

/** Roles in increasing order of power. */
export const ROLE_ORDER: Role[] = ["viewer", "checker", "tabber", "director", "owner"];

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  owner: "Full control, including deleting the tournament and managing owners.",
  director: "Everything except deleting the tournament.",
  tabber: "Pair rounds, place judges and rooms, publish, enter ballots.",
  checker: "Enter and confirm ballots; view the tab room.",
  viewer: "Read-only access to the tab room.",
};

export const roleAtLeast = (role: Role, min: Role): boolean =>
  ROLE_ORDER.indexOf(role) >= ROLE_ORDER.indexOf(min);

export async function getRole(
  db: Queryable,
  actor: Actor,
  tournamentId: string,
): Promise<Role | null> {
  if (actor.kind === "system") return "owner";
  if (actor.kind !== "user") return null;
  if (actor.siteAdmin) return "owner";
  const [row] = await db
    .select({ role: tournamentMember.role })
    .from(tournamentMember)
    .where(
      and(
        eq(tournamentMember.tournamentId, tournamentId),
        eq(tournamentMember.userId, actor.userId),
      ),
    );
  return row?.role ?? null;
}

/** Throws unless the actor holds at least `min` on the tournament. */
export async function requireRole(
  db: Queryable,
  actor: Actor,
  tournamentId: string,
  min: Role,
): Promise<Role> {
  const role = await getRole(db, actor, tournamentId);
  if (!role || !roleAtLeast(role, min)) throw forbidden();
  return role;
}
