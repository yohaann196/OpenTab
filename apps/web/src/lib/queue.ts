import "server-only";
import {
  handleJob,
  type JobName,
  type JobPayloads,
  type JobQueue,
  publishDueRounds,
} from "@opentab/core";
import { after } from "next/server";
import { db } from "./db";
import { env } from "./env";

/**
 * Job mode: "worker" hands jobs to pg-boss for apps/worker (Docker/self-host);
 * "inline" runs them in this process after the response is sent — for
 * serverless hosts where no long-running worker exists.
 */
export const jobMode: "worker" | "inline" =
  (process.env.JOB_MODE as "worker" | "inline" | undefined) ??
  (process.env.VERCEL ? "inline" : "worker");

type Boss = {
  send: (name: string, data: object, opts?: object) => Promise<string | null>;
  createQueue: (name: string) => Promise<void>;
};

let bossPromise: Promise<Boss | null> | null = null;

async function getBoss(): Promise<Boss | null> {
  if (!process.env.DATABASE_URL) return null;
  bossPromise ??= (async () => {
    try {
      const { PgBoss } = await import("pg-boss");
      const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
      boss.on("error", (e: unknown) => console.error("[pg-boss]", e));
      await boss.start();
      return boss as unknown as Boss;
    } catch (e) {
      console.error("[queue] pg-boss unavailable; jobs will be dropped", e);
      return null;
    }
  })();
  return bossPromise;
}

const created = new Set<string>();

const workerQueue: JobQueue = {
  async enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts?: { startAfter?: Date }) {
    const boss = await getBoss();
    if (!boss) return;
    if (!created.has(name)) {
      await boss.createQueue(name).catch(() => {});
      created.add(name);
    }
    await boss.send(name, data, opts?.startAfter ? { startAfter: opts.startAfter } : {});
  },
};

async function runInline<N extends JobName>(name: N, data: JobPayloads[N]) {
  try {
    const summary = await handleJob(db(), name, data, { appUrl: env.appUrl, queue: inlineQueue });
    console.info(`[job ${name}] ${summary}`);
  } catch (e) {
    console.error(`[job ${name}] failed`, e);
  }
}

const inlineQueue: JobQueue = {
  async enqueue<N extends JobName>(name: N, data: JobPayloads[N], opts?: { startAfter?: Date }) {
    // Delayed jobs are covered by the due-publish sweep (round.scheduledPublishAt is stored).
    if (opts?.startAfter && opts.startAfter.getTime() > Date.now()) return;
    try {
      after(() => runInline(name, data));
    } catch {
      // Outside a request scope (e.g. a job enqueuing a follow-up): run now.
      await runInline(name, data);
    }
  },
};

/** The job queue for Server Actions and route handlers. */
export const queue: JobQueue = jobMode === "inline" ? inlineQueue : workerQueue;

/** Publishes rounds whose scheduled time has passed. Returns how many were published. */
export async function runDuePublishes(): Promise<number> {
  return publishDueRounds(db(), queue);
}

let lastSweep = 0;

/**
 * Opportunistic, throttled due-publish sweep for inline mode, called from
 * frequently-hit routes via after(). Hobby-tier crons are daily, so traffic
 * (tab room pages, live polling) is what makes scheduled publishes on time.
 */
export async function sweepDuePublishes(): Promise<void> {
  if (jobMode !== "inline") return;
  const now = Date.now();
  if (now - lastSweep < 30_000) return;
  lastSweep = now;
  await runDuePublishes().catch((e) => console.error("[sweep]", e));
}
