import type { SnapshotDebate } from "@opentab/core";
import { ExternalLink, Gavel, MapPin } from "lucide-react";
import { SideBadge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** One debate on the public pairings page; big and readable on phones. */
export function DebateCard({
  d,
  sideLabels,
  isCongress,
  highlight,
}: {
  d: SnapshotDebate;
  sideLabels: [string, string] | null;
  isCongress: boolean;
  highlight?: boolean;
}) {
  return (
    <li
      id={`d-${d.id}`}
      className={cn(
        "rounded-xl border border-border bg-surface p-4 shadow-soft",
        highlight && "border-brand ring-2 ring-brand/30",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {isCongress ? (
            <>
              <div className="font-semibold">{d.label}</div>
              <p className="text-sm text-fg-muted">{d.entries.map((e) => e.code).join(" · ")}</p>
            </>
          ) : d.bye ? (
            <div className="flex items-center gap-2">
              <span className="font-semibold">{d.entries[0]?.code}</span>
              <span className="text-sm text-fg-muted">has a bye</span>
            </div>
          ) : (
            d.entries.map((e) => (
              <div key={e.id} className="flex min-w-0 items-center gap-2">
                <span className="w-12 shrink-0">
                  <SideBadge side={e.side} labels={sideLabels} pending={d.sidesPending} />
                </span>
                <span className="truncate font-semibold">{e.code}</span>
                {e.competitors.length > 0 && (
                  <span className="hidden truncate text-sm text-fg-muted sm:inline">
                    {e.competitors.join(" & ")}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
        {!d.bye && (
          <div className="shrink-0 text-right">
            <div className="inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 py-1 text-sm font-semibold">
              <MapPin className="size-3.5 text-brand" aria-hidden /> {d.room?.name ?? "TBA"}
            </div>
            {d.flight > 1 && <div className="mt-1 text-xs text-fg-subtle">Flight {d.flight}</div>}
          </div>
        )}
      </div>
      {!d.bye && (d.judges.length > 0 || d.room?.onlineUrl) && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-2.5 text-sm text-fg-muted">
          {d.judges.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Gavel className="size-3.5" aria-hidden />
              {d.judges
                .map((j) => j.name + (j.role === "chair" && d.judges.length > 1 ? " (c)" : ""))
                .join(", ")}
            </span>
          )}
          {d.room?.onlineUrl && (
            <a
              href={d.room.onlineUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden /> Online room
            </a>
          )}
        </div>
      )}
    </li>
  );
}
