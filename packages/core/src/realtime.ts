import { liveCursor, type Queryable } from "@opentab/db";
import { eq, sql } from "drizzle-orm";

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

/**
 * Emits a realtime event. Listeners (SSE) get it via NOTIFY after the
 * transaction commits; pollers (serverless) see the bumped `live_cursor`.
 */
export async function emit(
  db: Queryable,
  tournamentId: string,
  event: RealtimeEvent,
): Promise<void> {
  const payload = JSON.stringify({ t: tournamentId, e: event } satisfies RealtimeMessage);
  await db.execute(sql`select pg_notify(${REALTIME_CHANNEL}, ${payload})`);
  await db
    .insert(liveCursor)
    .values({ tournamentId, seq: 1, lastEvent: event })
    .onConflictDoUpdate({
      target: liveCursor.tournamentId,
      set: { seq: sql`${liveCursor.seq} + 1`, lastEvent: event, updatedAt: new Date() },
    });
}

export interface LivePulse {
  seq: number;
  event: RealtimeEvent | null;
}

/** Current change counter for a tournament (for polling clients). */
export async function livePulse(db: Queryable, tournamentId: string): Promise<LivePulse> {
  const [row] = await db.select().from(liveCursor).where(eq(liveCursor.tournamentId, tournamentId));
  return { seq: row?.seq ?? 0, event: (row?.lastEvent as RealtimeEvent | null) ?? null };
}
