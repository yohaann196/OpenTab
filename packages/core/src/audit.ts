import { auditLog, type Queryable } from "@opentab/db";
import { type Actor, actorLabel, actorUserId } from "./actor";

export interface AuditInput {
  tournamentId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/** Append-only audit trail of every change made in the tab room. */
export async function audit(db: Queryable, actor: Actor, input: AuditInput): Promise<void> {
  await db.insert(auditLog).values({
    tournamentId: input.tournamentId,
    actorUserId: actorUserId(actor),
    actorLabel: actorLabel(actor),
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    summary: input.summary,
    before: input.before ?? null,
    after: input.after ?? null,
  });
}
