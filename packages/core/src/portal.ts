import {
  entry,
  event,
  prefSheet,
  publishedSnapshot,
  type Queryable,
  round,
  school,
  tournament,
} from "@opentab/db";
import { type EventConfig, isDebateConfig } from "@opentab/engine";
import { and, desc, eq, inArray } from "drizzle-orm";
import { releasedBallotsForEntry } from "./ballots";
import { assertFound } from "./errors";
import { entryRecord } from "./results";
import type { PairingsSnapshot } from "./snapshots";

/** Everything an entry sees on its private page. */
export async function entryPortalData(db: Queryable, entryId: string) {
  const [e] = await db.select().from(entry).where(eq(entry.id, entryId));
  const en = assertFound(e, "Entry");
  const [ev] = await db.select().from(event).where(eq(event.id, en.eventId));
  const [t] = await db.select().from(tournament).where(eq(tournament.id, en.tournamentId));
  const [sc] = en.schoolId ? await db.select().from(school).where(eq(school.id, en.schoolId)) : [];
  const rounds = await db.select({ id: round.id }).from(round).where(eq(round.eventId, en.eventId));
  const snaps = rounds.length
    ? await db
        .select()
        .from(publishedSnapshot)
        .where(
          and(
            eq(publishedSnapshot.kind, "pairings"),
            inArray(
              publishedSnapshot.refId,
              rounds.map((r) => r.id),
            ),
          ),
        )
        .orderBy(desc(publishedSnapshot.publishedAt))
    : [];
  const appearances = snaps
    .map((s) => {
      const snap = s.data as PairingsSnapshot;
      const debate = snap.debates.find((d) => d.entries.some((x) => x.id === entryId));
      return debate ? { round: snap.round, debate } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => b.round.seq - a.round.seq);
  const cfg = ev!.config as EventConfig;
  const prefsMode = isDebateConfig(cfg) ? cfg.judging.prefs : "none";
  const [sheet] =
    prefsMode !== "none"
      ? await db.select().from(prefSheet).where(eq(prefSheet.entryId, entryId))
      : [];
  return {
    entry: { id: en.id, code: en.code, name: en.name, status: en.status, school: sc?.name ?? null },
    event: { id: ev!.id, name: ev!.name, abbreviation: ev!.abbreviation, format: ev!.format },
    tournament: { slug: t!.slug, name: t!.name, timezone: t!.timezone },
    sideLabels: isDebateConfig(cfg) ? cfg.sideLabels : null,
    current: appearances[0] ?? null,
    appearances,
    record: ev!.format === "congress" ? [] : await entryRecord(db, en.eventId, entryId),
    ballots: await releasedBallotsForEntry(db, entryId),
    prefs:
      prefsMode === "none" ? null : { mode: prefsMode, submittedAt: sheet?.submittedAt ?? null },
  };
}
