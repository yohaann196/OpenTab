"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
    const es = new EventSource(`/api/t/${slug}/stream`);
    es.addEventListener("hello", () => setStatus("live"));
    es.addEventListener("update", (msg) => {
      const e = JSON.parse((msg as MessageEvent).data) as Event;
      if (wanted && !wanted.includes(e.type)) return;
      const text = announceRef.current?.[e.type];
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(
        () => {
          router.refresh();
          if (text) toast(text);
        },
        150 + Math.random() * 1200,
      );
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
