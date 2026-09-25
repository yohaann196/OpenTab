/**
 * Background job queue abstraction. The web app and worker back this with
 * pg-boss; tests use the in-memory queue.
 */
export type JobName = "notify.round" | "notify.ballotReminder" | "round.scheduledPublish";

export interface JobPayloads {
  "notify.round": { tournamentId: string; roundId: string; kind: "published" | "motion" };
  "notify.ballotReminder": { tournamentId: string; roundId: string };
  "round.scheduledPublish": { tournamentId: string; roundId: string; version: number };
}

export interface JobQueue {
  enqueue<N extends JobName>(
    name: N,
    data: JobPayloads[N],
    opts?: { startAfter?: Date },
  ): Promise<void>;
}

export class MemoryQueue implements JobQueue {
  readonly jobs: { name: JobName; data: unknown; startAfter?: Date }[] = [];
  async enqueue<N extends JobName>(
    name: N,
    data: JobPayloads[N],
    opts?: { startAfter?: Date },
  ): Promise<void> {
    this.jobs.push({ name, data, startAfter: opts?.startAfter });
  }
}

export const noopQueue: JobQueue = { enqueue: async () => {} };
