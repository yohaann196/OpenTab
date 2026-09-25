import "server-only";
import { REALTIME_CHANNEL, type RealtimeEvent, type RealtimeMessage } from "@opentab/core";
import { getListenSql } from "@opentab/db";

type Listener = (e: RealtimeEvent) => void;

/**
 * One Postgres LISTEN connection per server process fans events out to every
 * connected SSE client. Scales horizontally: each web instance listens once.
 */
class RealtimeHub {
  private listeners = new Map<string, Set<Listener>>();
  private started: Promise<void> | null = null;

  private ensure() {
    this.started ??= getListenSql()
      .listen(REALTIME_CHANNEL, (payload) => {
        try {
          const msg = JSON.parse(payload) as RealtimeMessage;
          this.listeners.get(msg.t)?.forEach((fn) => {
            fn(msg.e);
          });
        } catch {
          /* ignore malformed payloads */
        }
      })
      .then(() => undefined)
      .catch((err) => {
        console.error("[realtime] listen failed", err);
        this.started = null;
      });
    return this.started;
  }

  async subscribe(tournamentId: string, fn: Listener): Promise<() => void> {
    await this.ensure();
    let set = this.listeners.get(tournamentId);
    if (!set) {
      set = new Set();
      this.listeners.set(tournamentId, set);
    }
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.listeners.delete(tournamentId);
    };
  }

  get connectionCount() {
    let n = 0;
    for (const s of this.listeners.values()) n += s.size;
    return n;
  }
}

const g = globalThis as unknown as { __opentabHub?: RealtimeHub };
if (!g.__opentabHub) g.__opentabHub = new RealtimeHub();
export const hub = g.__opentabHub;
