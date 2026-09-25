import { handleJob, type JobName, type JobPayloads } from "@opentab/core";
import { createDb } from "@opentab/db";
import { PgBoss } from "pg-boss";

/**
 * OpenTab background worker (Docker/self-hosted). Publishing a round never
 * waits on email or push delivery: the web app enqueues a job and this
 * process fans it out with bounded concurrency and dead-subscription cleanup.
 * Serverless deployments run the same handlers inline instead (JOB_MODE=inline).
 */

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const { db } = createDb(url);
const boss = new PgBoss({ connectionString: url });
boss.on("error", (e: unknown) => console.error("[pg-boss]", e));

const queue = {
  async enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts?: { startAfter?: Date }) {
    await boss.send(name, data, opts?.startAfter ? { startAfter: opts.startAfter } : {});
  },
};

const JOBS: JobName[] = ["notify.round", "notify.ballotReminder", "round.scheduledPublish"];

async function main() {
  await boss.start();
  for (const name of JOBS) {
    await boss.createQueue(name).catch(() => {});
    await boss.work<JobPayloads[typeof name]>(name, async (jobs) => {
      for (const job of jobs) {
        const summary = await handleJob(db, name, job.data, { appUrl, queue });
        console.info(`[${name}] ${summary}`);
      }
    });
  }
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
