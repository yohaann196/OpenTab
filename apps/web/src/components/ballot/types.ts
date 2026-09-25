import type { BallotInput } from "@opentab/core";
import type { EventConfig, Finding } from "@opentab/engine";

/** Serialisable data for rendering a ballot form (judge portal or tab entry). */
export interface BallotFormData {
  ballotId: string;
  status: "pending" | "draft" | "submitted" | "confirmed";
  version: number;
  roundLabel: string;
  eventName: string;
  roomName: string | null;
  onlineUrl: string | null;
  motion: string | null;
  judgeName: string;
  config: EventConfig;
  sidesPending: boolean;
  entries: {
    id: string;
    code: string;
    side: "A" | "B" | null;
    competitors: { id: string; name: string }[];
  }[];
  winnerId: string | null;
  rfd: string | null;
  comments: Record<string, string>;
  rfdDeadline: string | null;
  scores: {
    entryId: string;
    competitorId: string;
    position: number;
    reply: boolean;
    points: number;
    rank: number | null;
    components: { style: number; content: number; strategy: number } | null;
  }[];
  congress: {
    speeches: { entryId: string; points: number }[];
    ranks: { entryId: string; rank: number }[];
    po?: { entryId: string; points: number } | null;
  } | null;
}

export type SaveResult =
  | { ok: true; warnings?: Finding[] }
  | { ok: false; error: string; findings?: Finding[]; network?: boolean };

export type SaveFn = (input: BallotInput, mode: "draft" | "submit") => Promise<SaveResult>;
