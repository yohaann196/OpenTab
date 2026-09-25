import "server-only";
import type { JobName, JobPayloads, JobQueue } from "@opentab/core";

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

/** Web-side job queue backed by pg-boss (consumed by apps/worker). */
export const queue: JobQueue = {
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
