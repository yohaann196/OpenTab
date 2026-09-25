import {
  getEvent,
  listRounds,
  listTimeslots,
  nextElimLabel,
  requireTournamentBySlug,
} from "@opentab/core";
import { ballot, pairing } from "@opentab/db";
import type { DebateConfig } from "@opentab/engine";
import { and, count, eq, inArray } from "drizzle-orm";
import { ArrowRight, CalendarRange } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Progress } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { NewRoundButton } from "./new-round";

const METHOD_LABEL: Record<string, string> = {
  random: "Random preset",
  protected: "Protected preset",
  balanced: "Balanced preset",
  powermatch: "Power-matched",
  round_robin: "Round robin",
  elim: "Elimination",
  congress: "Chambers",
  manual: "Manual",
};

export default async function RoundsPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const ev = await getEvent(db(), eventId);
  const rounds = await listRounds(db(), eventId);
  const timeslots = await listTimeslots(db(), t.id);
  const ids = rounds.map((r) => r.id);
  const ballotCounts = ids.length
    ? await db()
        .select({ roundId: pairing.roundId, status: ballot.status, n: count() })
        .from(ballot)
        .innerJoin(pairing, eq(pairing.id, ballot.pairingId))
        .where(and(inArray(pairing.roundId, ids)))
        .groupBy(pairing.roundId, ballot.status)
    : [];
  const elim = ev.format === "congress" ? null : await nextElimLabel(db(), eventId);
  const prelims = rounds.filter((r) => r.stage === "prelim").length;
  const cfg = ev.config as DebateConfig;
  const suggestion =
    ev.format === "congress"
      ? null
      : prelims < cfg.prelimRounds
        ? `Next: Round ${prelims + 1} of ${cfg.prelimRounds} (${prelims + 1 <= cfg.pairing.presetRounds ? "preset" : "power-matched"})`
        : "Prelims done — set the break, then pair elims.";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">{suggestion}</p>
        <NewRoundButton
          slug={slug}
          eventId={eventId}
          format={ev.format}
          timeslots={timeslots.map((s) => ({ id: s.id, label: s.label }))}
          defaultStage={ev.format !== "congress" && prelims >= cfg.prelimRounds ? "elim" : "prelim"}
          elimRemaining={elim?.remaining ?? 0}
          previousRounds={rounds.map((r) => ({ id: r.id, label: r.label }))}
        />
      </div>
      {rounds.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title={ev.format === "congress" ? "No sessions yet" : "No rounds yet"}
        >
          Create the first {ev.format === "congress" ? "session" : "round"}. OpenTab will pair it,
          place judges and rooms, and check everything before you publish.
        </EmptyState>
      ) : (
        <ol className="space-y-2">
          {rounds.map((r) => {
            const bc = ballotCounts.filter((b) => b.roundId === r.id);
            const total = bc.reduce((a, b) => a + b.n, 0);
            const done = bc
              .filter((b) => b.status === "submitted" || b.status === "confirmed")
              .reduce((a, b) => a + b.n, 0);
            return (
              <li key={r.id}>
                <Link
                  href={`/tab/${slug}/events/${eventId}/rounds/${r.id}`}
                  className="group grid items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-soft transition hover:border-brand/40 hover:shadow-lift sm:grid-cols-[1fr_12rem_auto]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{r.label}</span>
                      <Badge
                        tone={
                          r.status === "published"
                            ? "success"
                            : r.status === "completed"
                              ? "brand"
                              : "neutral"
                        }
                      >
                        {r.status}
                      </Badge>
                      {r.scheduledPublishAt && r.status === "draft" && (
                        <Badge tone="warning">scheduled</Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-sm text-fg-muted">
                      {METHOD_LABEL[r.method]} · {r.panelSize} judge{r.panelSize === 1 ? "" : "s"}
                      {r.flights > 1 ? ` · ${r.flights} flights` : ""}
                      {r.motion ? " · motion set" : ""}
                    </div>
                  </div>
                  <div>
                    {total > 0 && (
                      <div className="space-y-1">
                        <Progress
                          value={(done / total) * 100}
                          tone={done === total ? "success" : "brand"}
                        />
                        <div className="text-xs tabular text-fg-muted">
                          {done}/{total} ballots
                        </div>
                      </div>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" tabIndex={-1} className="justify-self-end">
                    Open <ArrowRight />
                  </Button>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
