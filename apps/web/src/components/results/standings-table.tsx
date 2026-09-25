"use client";

import type { StandingsView } from "@opentab/core";
import { Info, Trophy } from "lucide-react";
import { useState } from "react";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const fmt = (v: number | null) =>
  v === null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(2);

/** Team (and speaker) standings with per-row tiebreak explanations. */
export function StandingsTable({
  view,
  breakLine,
  highlight,
  compact,
}: {
  view: StandingsView;
  breakLine?: number;
  highlight?: string[];
  /** Show only the first two tiebreak columns (narrow layouts). */
  compact?: boolean;
}) {
  const [q, setQ] = useState("");
  // Hide coin flip and wins/losses columns (record already shows them).
  const cols = view.columns
    .map((c, i) => ({ ...c, i }))
    .filter(
      (c) =>
        !c.id.startsWith("coinflip") && !c.id.startsWith("wins_") && !c.id.startsWith("losses_"),
    )
    .slice(0, compact ? 2 : undefined);
  const rows = view.rows.filter((r) => matches(q, r.code, r.name, r.school));
  const speakers = view.speakers.filter((s) => matches(q, s.name, s.entryCode));
  const table = (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-xs text-fg-muted">
          <tr>
            <th scope="col" className="w-12 px-3 py-2 text-left font-medium">
              #
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Entry
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              {view.kind === "congress" ? "Speeches" : "Record"}
            </th>
            {cols.map((c) => (
              <th
                key={c.id}
                scope="col"
                className="whitespace-nowrap px-3 py-2 text-right font-medium"
              >
                {c.label}
              </th>
            ))}
            <th scope="col" className="w-10 px-3 py-2">
              <span className="sr-only">Why</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.entryId}
              className={cn(
                "border-t border-border",
                highlight?.includes(r.entryId) && "bg-brand-soft/50",
                breakLine && idx === breakLine - 1 && "border-b-2 border-b-brand",
              )}
            >
              <td className="px-3 py-2 tabular text-fg-muted">
                {r.rank <= 3 ? (
                  <Trophy
                    className={cn(
                      "inline size-3.5",
                      r.rank === 1 ? "text-[oklch(0.75_0.15_85)]" : "text-fg-subtle",
                    )}
                    aria-label={`Rank ${r.rank}`}
                  />
                ) : null}{" "}
                {r.rank}
                {r.tied ? "=" : ""}
              </td>
              <td className="min-w-44 px-3 py-2">
                <div className="font-medium">{r.code}</div>
                {(r.name || r.school) && (
                  <div className="text-xs text-fg-subtle">
                    {[r.name, r.school].filter(Boolean).join(" · ")}
                  </div>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-2 tabular">{r.record}</td>
              {cols.map((c) => (
                <td key={c.id} className="px-3 py-2 text-right tabular text-fg-muted">
                  {fmt(r.values[c.i] ?? null)}
                </td>
              ))}
              <td className="px-3 py-2">
                {r.explanation && (
                  <Tooltip content={r.explanation}>
                    <button
                      type="button"
                      className="rounded p-0.5 text-fg-subtle hover:text-fg"
                      aria-label={`Why ${r.code} is ranked ${r.rank}: ${r.explanation}`}
                    >
                      <Info className="size-4" />
                    </button>
                  </Tooltip>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <div className="space-y-3">
      <SearchInput
        value={q}
        onChange={setQ}
        placeholder="Search standings"
        className="w-full sm:w-72"
      />
      {view.speakers.length > 0 ? (
        <Tabs defaultValue="teams">
          <TabsList>
            <TabsTrigger value="teams">Teams</TabsTrigger>
            <TabsTrigger value="speakers">Speakers</TabsTrigger>
          </TabsList>
          <TabsContent value="teams" className="mt-3">
            {table}
          </TabsContent>
          <TabsContent value="speakers" className="mt-3">
            <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="w-12 px-3 py-2 text-left font-medium">
                      #
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Speaker
                    </th>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Entry
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Total
                    </th>
                    <th scope="col" className="w-10 px-3 py-2">
                      <span className="sr-only">Why</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {speakers.map((s) => (
                    <tr key={s.competitorId} className="border-t border-border">
                      <td className="px-3 py-2 tabular text-fg-muted">{s.rank}</td>
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-fg-muted">{s.entryCode}</td>
                      <td className="px-3 py-2 text-right tabular">{fmt(s.total)}</td>
                      <td className="px-3 py-2">
                        {s.explanation && (
                          <Tooltip content={s.explanation}>
                            <button
                              type="button"
                              className="rounded p-0.5 text-fg-subtle hover:text-fg"
                              aria-label={s.explanation}
                            >
                              <Info className="size-4" />
                            </button>
                          </Tooltip>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
        </Tabs>
      ) : (
        table
      )}
    </div>
  );
}
