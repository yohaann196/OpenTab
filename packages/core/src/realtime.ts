import type { Queryable } from "@opentab/db";
import { sql } from "drizzle-orm";

/** Postgres NOTIFY channel used for live updates (SSE fan-out in the web app). */
export const REALTIME_CHANNEL = "opentab_events";

export type RealtimeEvent =
  | { type: "round.published"; roundId: string; eventId: string }
  | { type: "round.updated"; roundId: string; eventId: string }
  | { type: "round.unpublished"; roundId: string; eventId: string }
  | { type: "ballot.updated"; roundId: string; pairingId: string; status: string }
  | { type: "standings.published"; eventId: string }
  | { type: "motion.released"; roundId: string }
  | { type: "tournament.updated" };

export interface RealtimeMessage {
  t: string;
  e: RealtimeEvent;
}

/** Emits a realtime event; delivered to listeners after the transaction commits. */
export async function emit(
  db: Queryable,
  tournamentId: string,
  event: RealtimeEvent,
): Promise<void> {
  const payload = JSON.stringify({ t: tournamentId, e: event } satisfies RealtimeMessage);
  await db.execute(sql`select pg_notify(${REALTIME_CHANNEL}, ${payload})`);
}
