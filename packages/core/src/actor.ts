/** Who is performing an action. Every domain service takes an Actor. */
export type Actor =
  | { kind: "user"; userId: string; name: string; siteAdmin?: boolean }
  | {
      kind: "token";
      tournamentId: string;
      subjectType: "judge" | "entry";
      subjectId: string;
      name: string;
    }
  | { kind: "system"; name?: string };

export const systemActor: Actor = { kind: "system", name: "OpenTab" };

export function actorLabel(actor: Actor): string {
  if (actor.kind === "user") return actor.name;
  if (actor.kind === "token") return `${actor.name} (${actor.subjectType} link)`;
  return actor.name ?? "System";
}

export const actorUserId = (actor: Actor): string | null =>
  actor.kind === "user" ? actor.userId : null;
