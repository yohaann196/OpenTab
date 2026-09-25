import "server-only";
import type { Actor } from "@opentab/core";
import { getRole, type Role, resolveToken, roleAtLeast, tokenActor } from "@opentab/core";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { db } from "./db";

export const getSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
});

export async function getUserActor(): Promise<Extract<Actor, { kind: "user" }> | null> {
  const s = await getSession();
  if (!s) return null;
  return { kind: "user", userId: s.user.id, name: s.user.name };
}

export async function requireUser(next?: string): Promise<Extract<Actor, { kind: "user" }>> {
  const actor = await getUserActor();
  if (!actor) redirect(`/sign-in${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return actor;
}

/** For tab-room pages: signed-in staff with at least `min` role, else 404/redirect. */
export async function requireStaff(tournamentId: string, min: Role = "viewer") {
  const actor = await requireUser();
  const role = await getRole(db(), actor, tournamentId);
  if (!role || !roleAtLeast(role, min)) notFound();
  return { actor, role };
}

export const getTokenActor = cache(async (token: string) => {
  const resolved = await resolveToken(db(), token);
  if (!resolved) return null;
  return { resolved, actor: tokenActor(resolved) };
});
