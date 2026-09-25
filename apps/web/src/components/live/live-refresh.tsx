"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { withBase } from "@/lib/paths";
import { cn } from "@/lib/utils";

const LIVE_MODE = process.env.NEXT_PUBLIC_LIVE_MODE ?? "sse";

type Event = {
  type: string;
  roundId?: string;
  eventId?: string;
  pairingId?: string;
  status?: string;
};

/**
 * Subscribes to the tournament's live event stream and refreshes the current
 * server-rendered page when relevant events arrive. Refreshes are debounced
 * with jitter so thousands of phones don't hit the server in the same instant.
 */
export function LiveRefresh({
  slug,
  types,
  announce,
  className,
  showIndicator = true,
}: {
  slug: string;
  types?: string[];
  announce?: Partial<Record<string, string>>;
  className?: string;
  showIndicator?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "offline">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typesKey = types?.join(",") ?? "";
  const announceRef = useRef(announce);
  announceRef.current = announce;

  useEffect(() => {
    const wanted = typesKey ? typesKey.split(",") : null;
    const schedule = (e: Event | null) => {
      if (e && wanted && !wanted.includes(e.type)) return;
      const text = e ? announceRef.current?.[e.type] : undefined;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => {
          router.refresh();
          if (text) toast(text);
        },
        150 + Math.random() * 1200,
      );
    };

    if (LIVE_MODE === "poll") return startPolling(slug, schedule, setStatus, timer);

    const es = new EventSource(withBase(`/api/t/${slug}/stream`));
    es.addEventListener("hello", () => setStatus("live"));
    es.addEventListener("update", (msg) => {
      schedule(JSON.parse((msg as MessageEvent).data) as Event);
    });
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? "offline" : "connecting");
    es.onopen = () => setStatus("live");
    return () => {
      es.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [slug, typesKey, router]);

  if (!showIndicator) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        status === "live"
          ? "text-success"
          : status === "connecting"
            ? "text-fg-subtle"
            : "text-warning",
        className,
      )}
      aria-live="polite"
    >
      <span
        className={cn(
          "size-2 rounded-full",
          status === "live"
            ? "animate-pulse-dot bg-success"
            : status === "connecting"
              ? "bg-fg-subtle"
              : "bg-warning",
        )}
      />
      {status === "live" ? "Live" : status === "connecting" ? "Connecting…" : "Offline — retrying"}
    </span>
  );
}

/**
 * Serverless fallback: polls a tiny, edge-cached change counter. Jittered,
 * pauses while the tab is hidden, and backs off when the network fails.
 */
function startPolling(
  slug: string,
  onChange: (e: Event | null) => void,
  setStatus: (s: "connecting" | "live" | "offline") => void,
  timer: React.RefObject<ReturnType<typeof setTimeout> | null>,
) {
  let seq: number | null = null;
  let stopped = false;
  let failures = 0;
  let poll: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === "visible") {
      try {
        const res = await fetch(withBase(`/api/t/${slug}/pulse`), { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { seq: number; event: Event | null };
        if (seq !== null && data.seq !== seq) onChange(data.seq - seq === 1 ? data.event : null);
        seq = data.seq;
        failures = 0;
        setStatus("live");
      } catch {
        failures++;
        setStatus(failures > 2 ? "offline" : "connecting");
      }
    }
    const base = Math.min(8000 * 2 ** Math.max(0, failures - 1), 60_000);
    poll = setTimeout(tick, base + Math.random() * 3000);
  };
  const onVisible = () => {
    if (document.visibilityState !== "visible") return;
    clearTimeout(poll);
    void tick();
  };
  document.addEventListener("visibilitychange", onVisible);
  void tick();
  return () => {
    stopped = true;
    clearTimeout(poll);
    document.removeEventListener("visibilitychange", onVisible);
    if (timer.current) clearTimeout(timer.current);
  };
}
