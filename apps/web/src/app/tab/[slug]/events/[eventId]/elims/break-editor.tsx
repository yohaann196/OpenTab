"use client";

import type { StandingsView } from "@opentab/core";
import { AlertTriangle, ArrowRight, Eye, Scissors, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  createBreakAction,
  createRoundAction,
  generateDraftAction,
  publishBracketAction,
} from "@/app/tab/actions";
import { type BracketData, BracketView } from "@/components/results/bracket-view";
import { StandingsTable } from "@/components/results/standings-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";

export function BreakEditor({
  slug,
  eventId,
  standings,
  currentBreak,
  bracket,
  sideLabels,
  prelimsDone,
  nextElim,
  bracketPublished,
}: {
  slug: string;
  eventId: string;
  standings: StandingsView;
  currentBreak: string[];
  bracket: BracketData;
  sideLabels: [string, string];
  prelimsDone: boolean;
  nextElim: { label: string; remaining: number } | null;
  bracketPublished: boolean;
}) {
  const router = useRouter();
  const [size, setSize] = useState(
    currentBreak.length ||
      Math.min(16, 2 ** Math.floor(Math.log2(Math.max(2, standings.rows.length / 2)))),
  );
  const { exec, pending } = useAction();
  const bubble = standings.rows[size - 1];
  const nextOut = standings.rows[size];
  const tiedAtBubble = bubble && nextOut && bubble.record === nextOut.record;

  const pairNext = async () => {
    if (!nextElim) return;
    const res = await exec(
      () =>
        createRoundAction(slug, eventId, {
          stage: "elim",
          settings: { breakSize: nextElim.remaining },
        }),
      { quiet: true },
    );
    if (!res.ok) return;
    await exec(() => generateDraftAction(slug, res.data), { quiet: true });
    router.push(`/tab/${slug}/events/${eventId}/rounds/${res.data}?generated=1`);
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Scissors className="size-4 text-brand" /> The break
            </CardTitle>
            <CardDescription>
              Top entries from prelim standings advance. Partial brackets give byes to the top
              seeds.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!prelimsDone && (
              <Alert tone="warning" icon={AlertTriangle} title="Prelims aren't finished">
                You can still preview the break, but standings may change.
              </Alert>
            )}
            <div className="flex items-end gap-2">
              <label className="grid flex-1 gap-1 text-sm">
                <span className="font-medium">Break size</span>
                <Input
                  type="number"
                  min={2}
                  max={Math.max(2, standings.rows.length)}
                  value={size}
                  onChange={(e) => setSize(Math.max(2, Number(e.target.value) || 2))}
                />
              </label>
              {[4, 8, 16, 32].map((n) => (
                <Button
                  key={n}
                  variant="ghost"
                  size="sm"
                  onClick={() => setSize(n)}
                  disabled={n > standings.rows.length}
                >
                  {n}
                </Button>
              ))}
            </div>
            {bubble && (
              <p className="text-sm text-fg-muted">
                Last in: <strong className="text-fg">{bubble.code}</strong> ({bubble.record})
                {nextOut && (
                  <>
                    {" "}
                    · first out: <strong className="text-fg">{nextOut.code}</strong> (
                    {nextOut.record})
                  </>
                )}
                {tiedAtBubble && (
                  <span className="mt-1 block text-[color-mix(in_oklch,var(--warning)_70%,var(--fg))]">
                    Same record at the bubble — decided by tiebreaks.
                  </span>
                )}
              </p>
            )}
            <Button
              className="w-full"
              loading={pending}
              onClick={() => exec(() => createBreakAction(slug, eventId, size))}
            >
              {currentBreak.length ? `Update break (${size})` : `Set ${size}-entry break`}
            </Button>
          </CardContent>
        </Card>
        {currentBreak.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-4 text-brand" /> Elimination rounds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {nextElim ? (
                <Button className="w-full" onClick={pairNext} loading={pending}>
                  Pair {nextElim.label} <ArrowRight />
                </Button>
              ) : (
                <p className="text-sm text-fg-muted">The bracket is complete.</p>
              )}
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => exec(() => publishBracketAction(slug, eventId))}
              >
                <Eye /> {bracketPublished ? "Update public bracket" : "Publish bracket"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="min-w-0 space-y-6">
        {bracket.rounds.length > 0 && (
          <section className="space-y-3">
            <h2 className="font-semibold">Bracket</h2>
            <BracketView data={bracket} sideLabels={sideLabels} />
          </section>
        )}
        <section className="space-y-3">
          <h2 className="font-semibold">Prelim standings</h2>
          <StandingsTable view={standings} breakLine={size} highlight={currentBreak} />
        </section>
      </div>
    </div>
  );
}
