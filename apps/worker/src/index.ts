import {
  type JobPayloads,
  loadRound,
  logNotification,
  planRoundNotifications,
  publishRound,
  removeFollowsByEndpoint,
  systemActor,
  tokenFor,
} from "@opentab/core";
import { ballot, createDb, judge, pairing } from "@opentab/db";
import { and, eq, inArray } from "drizzle-orm";
import { PgBoss } from "pg-boss";
import { deliver } from "./channels";

/**
 * OpenTab background worker. Publishing a round never waits on email or
 * push delivery: the web app enqueues a job and this process fans it out
 * with bounded concurrency, retries and dead-subscription cleanup.
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const { db } = createDb(url);
const boss = new PgBoss({ connectionString: url });
boss.on("error", (e: unknown) => console.error("[pg-boss]", e));

const queue = {
  async enqueue<N extends keyof JobPayloads>(
    name: N,
    data: JobPayloads[N],
    opts?: { startAfter?: Date },
  ) {
    await boss.send(name, data, opts?.startAfter ? { startAfter: opts.startAfter } : {});
  },
};

async function fanOut(
  tournamentId: string,
  messages: Awaited<ReturnType<typeof planRoundNotifications>>,
) {
  const CONCURRENCY = 20;
  let i = 0;
  let sent = 0;
  let failed = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
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

async function main() {
  await boss.start();
  for (const name of ["notify.round", "notify.ballotReminder", "round.scheduledPublish"])
    await boss.createQueue(name).catch(() => {});

  await boss.work<JobPayloads["notify.round"]>("notify.round", async (jobs) => {
    for (const job of jobs) {
      const msgs = await planRoundNotifications(db, job.data.roundId, job.data.kind, appUrl);
      const res = await fanOut(job.data.tournamentId, msgs);
      console.info(
        `[notify.round] ${job.data.roundId} ${job.data.kind}: ${res.sent} sent, ${res.failed} failed`,
      );
    }
  });

  await boss.work<JobPayloads["notify.ballotReminder"]>("notify.ballotReminder", async (jobs) => {
    for (const job of jobs) {
      const rows = await db
        .select({
          judgeId: ballot.judgeId,
          email: judge.email,
          name: judge.name,
          ballotId: ballot.id,
        })
        .from(ballot)
        .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
        .innerJoin(judge, eq(judge.id, ballot.judgeId))
        .where(
          and(eq(pairing.roundId, job.data.roundId), inArray(ballot.status, ["pending", "draft"])),
        );
      const r = await loadRound(db, job.data.roundId);
      const msgs = [];
      for (const row of rows) {
        if (!row.email) continue;
        const token = await tokenFor(db, "judge", row.judgeId);
        const link = token ? `${appUrl}/p/${token}/ballot/${row.ballotId}` : appUrl;
        msgs.push({
          followId: null,
          channel: "email" as const,
          endpoint: row.email,
          subject: `Reminder: your ${r.label} ballot`,
          body: `Hi ${row.name.split(" ")[0]}, the tab room is waiting on your ${r.label} ballot. You can submit the decision now and finish the RFD later.`,
          url: link,
        });
      }
      const res = await fanOut(job.data.tournamentId, msgs);
      console.info(`[notify.ballotReminder] ${job.data.roundId}: ${res.sent} sent`);
    }
  });

  await boss.work<JobPayloads["round.scheduledPublish"]>("round.scheduledPublish", async (jobs) => {
    for (const job of jobs) {
      const r = await loadRound(db, job.data.roundId).catch(() => null);
      if (!r || r.status !== "draft" || !r.scheduledPublishAt) continue;
      if (r.version !== job.data.version) {
        console.info(
          `[scheduledPublish] ${r.id} changed since scheduling; publishing latest version`,
        );
      }
      await publishRound(db, systemActor, r.id, queue, { force: true, notify: true });
      console.info(`[scheduledPublish] published ${r.label}`);
    }
  });

  console.info("OpenTab worker running.");
}

const shutdown = async () => {
  await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
