import { ballot, type Db, judge, pairing, round } from "@opentab/db";
import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { systemActor } from "./actor";
import type { JobName, JobPayloads, JobQueue } from "./jobs";
import { loadRound } from "./loaders";
import {
  logNotification,
  type PlannedMessage,
  planRoundNotifications,
  removeFollowsByEndpoint,
} from "./notify";
import { publishRound } from "./rounds";
import { tokenFor } from "./tokens";

/**
 * Notification delivery and job handlers. Shared by the pg-boss worker
 * (Docker/self-hosted) and the web app's inline mode (serverless hosts).
 *
 * Channels: Web Push (VAPID) and SMTP email — no carrier SMS gateways,
 * which the major US carriers have shut down. Both libraries load lazily so
 * the web bundle only pays for them when a job actually runs.
 */

export type SendOutcome = "sent" | "failed" | "gone";

type Mailer = { sendMail: (m: object) => Promise<unknown> };
type WebPush = {
  sendNotification: (sub: object, payload: string, opts?: object) => Promise<unknown>;
};

let mailer: Promise<Mailer | null> | undefined;
let webpush: Promise<WebPush | null> | undefined;

function getMailer() {
  mailer ??= (async () => {
    const url = process.env.SMTP_URL;
    if (!url) return null;
    const nodemailer = await import("nodemailer");
    return nodemailer.createTransport(url) as Mailer;
  })();
  return mailer;
}

function getWebPush() {
  webpush ??= (async () => {
    const pub = process.env.VAPID_PUBLIC_KEY ?? "";
    const priv = process.env.VAPID_PRIVATE_KEY ?? "";
    if (!pub || !priv) return null;
    const mod = (await import("web-push")).default;
    mod.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@opentab.local", pub, priv);
    return mod as WebPush;
  })();
  return webpush;
}

export async function deliver(
  m: PlannedMessage,
  appUrl: string,
): Promise<{ outcome: SendOutcome; error?: string }> {
  try {
    if (m.channel === "email") {
      const text = `${m.body}\n\n${m.url}\n\n—\nOpenTab · ${appUrl}`;
      const transport = await getMailer();
      if (!transport) {
        console.info(`[email] to=${m.endpoint} subject="${m.subject}"\n${text}`);
      } else {
        await transport.sendMail({
          from: process.env.EMAIL_FROM ?? "OpenTab <no-reply@opentab.local>",
          to: m.endpoint,
          subject: m.subject,
          text,
        });
      }
      return { outcome: "sent" };
    }
    const push = await getWebPush();
    if (!push || !m.keys) return { outcome: "failed", error: "push not configured" };
    await push.sendNotification(
      { endpoint: m.endpoint, keys: m.keys },
      JSON.stringify({ title: m.subject, body: m.body, url: m.url, tag: m.subject }),
      { TTL: 60 * 60, urgency: "high" },
    );
    return { outcome: "sent" };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410: the browser unsubscribed — clean up.
    if (status === 404 || status === 410) return { outcome: "gone", error: `HTTP ${status}` };
    return { outcome: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}

/** Sends messages with bounded concurrency, logging each and pruning dead subscriptions. */
export async function fanOut(
  db: Db,
  tournamentId: string,
  messages: PlannedMessage[],
  appUrl: string,
  concurrency = 20,
) {
  let i = 0;
  let sent = 0;
  let failed = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (i < messages.length) {
      const m = messages[i++]!;
      const res = await deliver(m, appUrl);
      if (res.outcome === "gone") await removeFollowsByEndpoint(db, m.endpoint);
      if (res.outcome === "sent") sent++;
      else failed++;
      await logNotification(
        db,
        tournamentId,
        m,
        res.outcome === "sent" ? "sent" : "failed",
        res.error,
      ).catch(() => {});
    }
  });
  await Promise.all(workers);
  return { sent, failed };
}

async function ballotReminders(db: Db, roundId: string, appUrl: string) {
  const rows = await db
    .select({ judgeId: ballot.judgeId, email: judge.email, name: judge.name, ballotId: ballot.id })
    .from(ballot)
    .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
    .innerJoin(judge, eq(judge.id, ballot.judgeId))
    .where(and(eq(pairing.roundId, roundId), inArray(ballot.status, ["pending", "draft"])));
  const r = await loadRound(db, roundId);
  const msgs: PlannedMessage[] = [];
  for (const row of rows) {
    if (!row.email) continue;
    const token = await tokenFor(db, "judge", row.judgeId);
    msgs.push({
      followId: null,
      channel: "email",
      endpoint: row.email,
      subject: `Reminder: your ${r.label} ballot`,
      body: `Hi ${row.name.split(" ")[0]}, the tab room is waiting on your ${r.label} ballot. You can submit the decision now and finish the RFD later.`,
      url: token ? `${appUrl}/p/${token}/ballot/${row.ballotId}` : appUrl,
    });
  }
  return msgs;
}

/** Runs one background job. `queue` receives follow-up jobs (e.g. notifications after a publish). */
export async function handleJob<N extends JobName>(
  db: Db,
  name: N,
  data: JobPayloads[N],
  ctx: { appUrl: string; queue: JobQueue },
): Promise<string> {
  switch (name) {
    case "notify.round": {
      const d = data as JobPayloads["notify.round"];
      const msgs = await planRoundNotifications(db, d.roundId, d.kind, ctx.appUrl);
      const res = await fanOut(db, d.tournamentId, msgs, ctx.appUrl);
      return `${d.roundId} ${d.kind}: ${res.sent} sent, ${res.failed} failed`;
    }
    case "notify.ballotReminder": {
      const d = data as JobPayloads["notify.ballotReminder"];
      const msgs = await ballotReminders(db, d.roundId, ctx.appUrl);
      const res = await fanOut(db, d.tournamentId, msgs, ctx.appUrl);
      return `${d.roundId}: ${res.sent} sent`;
    }
    case "round.scheduledPublish": {
      const d = data as JobPayloads["round.scheduledPublish"];
      const r = await loadRound(db, d.roundId).catch(() => null);
      if (!r || r.status !== "draft" || !r.scheduledPublishAt) return "skipped";
      await publishRound(db, systemActor, r.id, ctx.queue, { force: true, notify: true });
      return `published ${r.label}`;
    }
    default:
      return "unknown job";
  }
}

/**
 * Publishes every draft round whose scheduled time has passed. Used where
 * delayed jobs aren't available (serverless): called by a cron endpoint and
 * opportunistically on traffic.
 */
export async function publishDueRounds(db: Db, queue: JobQueue): Promise<number> {
  // Claim due rounds atomically so concurrent sweeps never double-publish.
  const due = await db
    .update(round)
    .set({ scheduledPublishAt: null })
    .where(
      and(
        eq(round.status, "draft"),
        isNotNull(round.scheduledPublishAt),
        lte(round.scheduledPublishAt, new Date()),
      ),
    )
    .returning({ id: round.id });
  let n = 0;
  for (const r of due) {
    try {
      await publishRound(db, systemActor, r.id, queue, { force: true, notify: true });
      n++;
    } catch (e) {
      console.error(`[publishDueRounds] ${r.id}`, e);
    }
  }
  return n;
}
