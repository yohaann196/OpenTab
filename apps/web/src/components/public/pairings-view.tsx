"use client";

import type { PairingsSnapshot } from "@opentab/core";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { LiveRefresh } from "@/components/live/live-refresh";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/segmented";
import { timeAgo } from "@/lib/utils";
import { DebateCard } from "./debate-card";

export function PairingsView({
  slug,
  snapshot,
}: {
  slug: string;
  snapshot: PairingsSnapshot & { publishedAt: string };
}) {
  const [q, setQ] = useState("");
  const [flight, setFlight] = useState("all");
  const r = snapshot.round;
  const isCongress = r.format === "congress";
  const debates = snapshot.debates.filter(
    (d) =>
      (flight === "all" || String(d.flight) === flight) &&
      matches(
        q,
        d.label,
        d.room?.name,
        ...d.entries.flatMap((e) => [e.code, e.name, e.school, ...e.competitors]),
        ...d.judges.map((j) => j.name),
      ),
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="brand">{r.eventAbbr}</Badge>
            <span className="text-xs text-fg-subtle">Updated {timeAgo(snapshot.publishedAt)}</span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {r.eventName} · {r.label}
          </h1>
          {r.startsAt && (
            <p className="text-sm text-fg-muted">
              Starts{" "}
              {new Date(r.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </p>
          )}
        </div>
        <LiveRefresh
          slug={slug}
          types={["round.published", "round.unpublished", "motion.released"]}
          announce={{
            "round.published": "Pairings updated",
            "motion.released": "The motion is out",
          }}
        />
      </div>
      {r.motion && (
        <div className="flex gap-3 rounded-xl border border-brand/30 bg-brand-soft p-4">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-brand-soft-fg">
              Motion
            </div>
            <p className="font-medium">{r.motion}</p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search name, code, school, judge or room"
          className="w-full sm:w-80"
        />
        {r.flights > 1 && (
          <Segmented
            label="Flight"
            value={flight}
            onChange={setFlight}
            options={[
              { value: "all", label: "All flights" },
              ...Array.from({ length: r.flights }, (_, i) => ({
                value: String(i + 1),
                label: `Flight ${i + 1}`,
              })),
            ]}
          />
        )}
        <span className="text-sm text-fg-muted">{debates.length} shown</span>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">
        {debates.map((d) => (
          <DebateCard key={d.id} d={d} sideLabels={r.sideLabels} isCongress={isCongress} />
        ))}
      </ul>
    </div>
  );
}
