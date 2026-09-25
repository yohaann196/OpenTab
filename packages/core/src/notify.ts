import {
  competitor,
  type Db,
  entry,
  follow,
  judge,
  notificationLog,
  publishedSnapshot,
  type Queryable,
  round,
  tournament,
} from "@opentab/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { invalid } from "./errors";
import type { PairingsSnapshot, SnapshotDebate } from "./snapshots";
import { tokenFor } from "./tokens";

/**
 * Notification planning. Given a published round, work out who should hear
 * about it and what to tell them. Delivery (Web Push / email) happens in the
 * worker, so publishing is never slowed down by thousands of sends.
 */

export interface PlannedMessage {
  followId: string | null;
  channel: "push" | "email";
  endpoint: string;
  keys?: { p256dh: string; auth: string } | null;
  subject: string;
  body: string;
  url: string;
}

function sideLabel(snap: PairingsSnapshot, side: "A" | "B" | null) {
  if (!side || !snap.round.sideLabels) return "";
  return side === "A" ? snap.round.sideLabels[0] : snap.round.sideLabels[1];
}

export function describeDebate(
  snap: PairingsSnapshot,
  d: SnapshotDebate,
  perspectiveEntryId?: string,
): string {
  const where = d.room ? `Room ${d.room.name}` : "Room TBA";
  if (d.bye) return `${d.entries[0]?.code ?? "Entry"} has a bye.`;
  if (d.label && snap.round.format === "congress") return `${d.label} — ${where}.`;
  const me = d.entries.find((e) => e.id === perspectiveEntryId);
  const parts = d.entries.map(
    (e) => `${e.code}${d.sidesPending ? "" : ` (${sideLabel(snap, e.side)})`}`,
  );
  const vs = me
    ? `${me.code}${d.sidesPending ? " (flip for sides)" : ` on ${sideLabel(snap, me.side)}`} vs ${d.entries
        .filter((e) => e.id !== me.id)
        .map((e) => e.code)
        .join(", ")}`
    : parts.join(" vs ");
  const judges = d.judges.length
    ? ` Judge${d.judges.length > 1 ? "s" : ""}: ${d.judges.map((j) => j.name).join(", ")}.`
    : "";
  const flight = snap.round.flights > 1 ? ` Flight ${d.flight}.` : "";
  return `${vs} — ${where}.${flight}${judges}`;
}

export async function planRoundNotifications(
  db: Queryable,
  roundId: string,
  kind: "published" | "motion",
  appUrl: string,
): Promise<PlannedMessage[]> {
  const [snapRow] = await db
    .select()
    .from(publishedSnapshot)
    .where(and(eq(publishedSnapshot.kind, "pairings"), eq(publishedSnapshot.refId, roundId)));
  if (!snapRow) return [];
  const snap = snapRow.data as PairingsSnapshot;
  const [r] = await db.select().from(round).where(eq(round.id, roundId));
  const [t] = await db.select().from(tournament).where(eq(tournament.id, r!.tournamentId));
  const pairingsUrl = `${appUrl}/t/${t!.slug}/pairings/${roundId}`;
  const title = `${snap.round.eventAbbr} ${snap.round.label}`;

  if (kind === "motion") {
    const follows = await db.select().from(follow).where(eq(follow.tournamentId, t!.id));
    const seen = new Set<string>();
    return follows
      .filter((f) => !seen.has(f.endpoint) && seen.add(f.endpoint))
      .map((f) => ({
        followId: f.id,
        channel: f.channel,
        endpoint: f.endpoint,
        keys: f.keys,
        subject: `${title}: motion released`,
        body: snap.round.motion ?? "",
        url: pairingsUrl,
      }));
  }

  const byEntry = new Map<string, SnapshotDebate>();
  const byJudge = new Map<string, SnapshotDebate>();
  for (const d of snap.debates) {
    for (const e of d.entries) byEntry.set(e.id, d);
    for (const j of d.judges) byJudge.set(j.id, d);
  }
  const entryIds = [...byEntry.keys()];
  const entrySchools = entryIds.length
    ? await db
        .select({ id: entry.id, schoolId: entry.schoolId })
        .from(entry)
        .where(inArray(entry.id, entryIds))
    : [];
  const follows = await db.select().from(follow).where(eq(follow.tournamentId, t!.id));
  const out: PlannedMessage[] = [];
  const dedupe = new Set<string>();
  const push = (m: PlannedMessage) => {
    const k = `${m.channel}:${m.endpoint}:${m.body}`;
    if (dedupe.has(k)) return;
    dedupe.add(k);
    out.push(m);
  };

  for (const f of follows) {
    const base = {
      followId: f.id,
      channel: f.channel,
      endpoint: f.endpoint,
      keys: f.keys,
      url: pairingsUrl,
    };
    if (f.targetType === "entry") {
      const d = byEntry.get(f.targetId);
      if (d)
        push({ ...base, subject: `${title} is out`, body: describeDebate(snap, d, f.targetId) });
    } else if (f.targetType === "judge") {
      const d = byJudge.get(f.targetId);
      if (d)
        push({ ...base, subject: `${title}: judging assignment`, body: describeDebate(snap, d) });
    } else if (f.targetType === "school") {
      for (const es of entrySchools.filter((x) => x.schoolId === f.targetId)) {
        const d = byEntry.get(es.id);
        if (d) push({ ...base, subject: `${title} is out`, body: describeDebate(snap, d, es.id) });
      }
    } else if (f.targetType === "tournament") {
      push({ ...base, subject: `${title} is out`, body: `Pairings for ${title} are posted.` });
    }
  }

  // Judges with an email always get their assignment and private ballot link.
  const judgeIds = [...byJudge.keys()];
  if (judgeIds.length) {
    const js = await db.select().from(judge).where(inArray(judge.id, judgeIds));
    for (const j of js) {
      if (!j.email) continue;
      const token = await tokenFor(db, "judge", j.id);
      push({
        followId: null,
        channel: "email",
        endpoint: j.email,
        subject: `${title}: you're judging`,
        body: `${describeDebate(snap, byJudge.get(j.id)!)}${token ? `\n\nYour ballot: ${appUrl}/p/${token}` : ""}`,
        url: token ? `${appUrl}/p/${token}` : pairingsUrl,
      });
    }
  }
  // Competitors with an email get their pairing.
  if (entryIds.length) {
    const comps = await db.select().from(competitor).where(inArray(competitor.entryId, entryIds));
    for (const c of comps) {
      if (!c.email) continue;
      push({
        followId: null,
        channel: "email",
        endpoint: c.email,
        subject: `${title} is out`,
        body: describeDebate(snap, byEntry.get(c.entryId)!, c.entryId),
        url: pairingsUrl,
      });
    }
  }
  return out;
}

export async function logNotification(
  db: Queryable,
  tournamentId: string,
  m: PlannedMessage,
  status: "sent" | "failed",
  error?: string,
) {
  await db.insert(notificationLog).values({
    tournamentId,
    followId: m.followId,
    channel: m.channel,
    subject: m.subject,
    status,
    error: error ?? null,
  });
}

export const followInput = z.object({
  targetType: z.enum(["entry", "judge", "school", "tournament"]),
  targetId: z.uuid(),
  channel: z.enum(["push", "email"]),
  endpoint: z.string().min(3).max(2000),
  keys: z.object({ p256dh: z.string(), auth: z.string() }).nullable().optional(),
});

export async function addFollow(
  db: Db,
  tournamentId: string,
  raw: z.input<typeof followInput>,
  userId?: string | null,
) {
  const input = followInput.parse(raw);
  if (input.channel === "email" && !z.email().safeParse(input.endpoint).success)
    throw invalid("Enter a valid email address");
  if (input.channel === "push" && !/^https:\/\//.test(input.endpoint))
    throw invalid("Invalid push subscription");
  const [row] = await db
    .insert(follow)
    .values({ tournamentId, ...input, keys: input.keys ?? null, userId: userId ?? null })
    .onConflictDoUpdate({
      target: [
        follow.tournamentId,
        follow.targetType,
        follow.targetId,
        follow.channel,
        follow.endpoint,
      ],
      set: { keys: input.keys ?? null },
    })
    .returning();
  return row!;
}

export async function removeFollowByToken(db: Db, unsubscribeToken: string) {
  const res = await db
    .delete(follow)
    .where(eq(follow.unsubscribeToken, unsubscribeToken))
    .returning();
  return res.length > 0;
}

export async function removeFollowsByEndpoint(db: Db, endpoint: string) {
  await db.delete(follow).where(eq(follow.endpoint, endpoint));
}
