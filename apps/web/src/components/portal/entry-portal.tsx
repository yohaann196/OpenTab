"use client";

import type { entryPortalData } from "@opentab/core";
import {
  ArrowRight,
  ClipboardList,
  ExternalLink,
  Gavel,
  MapPin,
  Megaphone,
  ScrollText,
  Trophy,
} from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { Badge, SideBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { PushToggle } from "./push-toggle";

type Data = Awaited<ReturnType<typeof entryPortalData>>;

export function EntryPortal({ token, data }: { token: string; data: Data }) {
  const cur = data.current;
  const me = cur?.debate.entries.find((e) => e.id === data.entry.id);
  const opponents = cur?.debate.entries.filter((e) => e.id !== data.entry.id) ?? [];
  const wins = data.record.filter((r) => r.result === "W" || r.result === "Bye").length;
  const losses = data.record.filter((r) => r.result === "L").length;
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{data.entry.code}</h1>
          <p className="text-sm text-fg-muted">
            {data.event.name}
            {data.entry.school ? ` · ${data.entry.school}` : ""}
          </p>
        </div>
        <LiveRefresh
          slug={data.tournament.slug}
          types={["round.published", "motion.released"]}
          announce={{ "round.published": "New pairings are out!" }}
        />
      </div>

      {cur ? (
        <article className="overflow-hidden rounded-2xl border border-brand/30 bg-surface shadow-lift">
          <div className="bg-brand px-5 py-4 text-brand-fg">
            <div className="text-xs font-medium uppercase tracking-wider opacity-80">
              {cur.round.eventAbbr} · {cur.round.label}
            </div>
            <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <MapPin className="size-6" aria-hidden />{" "}
              {cur.debate.bye
                ? "Bye"
                : cur.debate.room
                  ? `Room ${cur.debate.room.name}`
                  : "Room TBA"}
            </div>
          </div>
          {!cur.debate.bye && (
            <div className="space-y-4 p-5">
              {data.event.format === "congress" ? (
                <p className="text-sm">
                  <strong>{cur.debate.label}</strong> · {cur.debate.entries.length} legislators
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  You&apos;re{" "}
                  <SideBadge
                    side={me?.side ?? null}
                    labels={data.sideLabels}
                    pending={cur.debate.sidesPending}
                  />{" "}
                  vs{" "}
                  {opponents.map((o) => (
                    <strong key={o.id}>{o.code}</strong>
                  ))}
                </div>
              )}
              {cur.debate.judges.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-fg-muted">
                  <Gavel className="size-4" aria-hidden />{" "}
                  {cur.debate.judges.map((j) => j.name).join(", ")}
                </div>
              )}
              {cur.round.motion && (
                <div className="rounded-xl bg-surface-2 p-3 text-sm">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
                    <Megaphone className="size-3.5" /> Motion
                  </div>
                  {cur.round.motion}
                </div>
              )}
              {cur.debate.room?.onlineUrl && (
                <Button asChild variant="secondary" className="w-full">
                  <a href={cur.debate.room.onlineUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> Join online room
                  </a>
                </Button>
              )}
            </div>
          )}
        </article>
      ) : (
        <EmptyState icon={MapPin} title="No pairings yet">
          This page updates automatically when round 1 is published.
        </EmptyState>
      )}

      <PushToggle
        slug={data.tournament.slug}
        targetType="entry"
        targetId={data.entry.id}
        label={`Notify me when ${data.entry.code}'s pairings are posted`}
      />

      {data.prefs && (
        <Card>
          <CardContent className="flex items-center gap-4 py-4">
            <ClipboardList className="size-6 text-brand" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="font-medium">Judge preferences</div>
              <div className="text-sm text-fg-muted">
                {data.prefs.submittedAt
                  ? `Submitted ${new Date(data.prefs.submittedAt).toLocaleString()}`
                  : "Not submitted yet"}
              </div>
            </div>
            <Button asChild size="sm" variant={data.prefs.submittedAt ? "secondary" : "primary"}>
              <Link href={`/p/${token}/prefs`}>
                {data.prefs.submittedAt ? "Edit" : "Fill out"} <ArrowRight />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {data.record.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-brand" /> Record
            </CardTitle>
            <span className="text-sm font-semibold tabular">
              {wins}–{losses}
            </span>
          </CardHeader>
          <CardContent className="py-2">
            <ol className="divide-y divide-border">
              {data.record.map((r) => (
                <li key={r.roundId} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-16 text-fg-muted">
                    {r.stage === "elim" ? "Elim" : `Round ${r.seq}`}
                  </span>
                  <span className="flex-1 truncate">{r.bye ? "Bye" : `vs ${r.opponent}`}</span>
                  {r.side && data.sideLabels && (
                    <span className="text-xs text-fg-subtle">
                      {r.side === "A" ? data.sideLabels[0] : data.sideLabels[1]}
                    </span>
                  )}
                  <Badge
                    tone={
                      r.result === "W" || r.result === "Bye"
                        ? "success"
                        : r.result === "L"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {r.result}
                    {r.ballots &&
                    r.ballots.includes("–") &&
                    !r.ballots.endsWith("–0") &&
                    !r.ballots.startsWith("0")
                      ? ` ${r.ballots}`
                      : ""}
                  </Badge>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {data.ballots.length > 0 && (
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg-muted">
            <ScrollText className="size-4" /> Ballots &amp; feedback
          </h2>
          {data.ballots.map((b, i) => (
            <details
              key={i}
              className="group rounded-2xl border border-border bg-surface p-4 shadow-soft"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{b.roundLabel}</strong> · {b.judgeName}
                </span>
                <Badge tone={b.won ? "success" : "danger"}>{b.won ? "Win" : "Loss"}</Badge>
              </summary>
              <div className="mt-3 space-y-2 text-sm">
                {b.points.length > 0 && (
                  <p className="text-fg-muted">
                    Points:{" "}
                    {b.points.map((p) => `${p.reply ? "reply " : ""}${p.points}`).join(", ")}
                  </p>
                )}
                {b.rfd && <p className="whitespace-pre-wrap">{b.rfd}</p>}
                {b.comment && (
                  <p className={cn("whitespace-pre-wrap rounded-lg bg-surface-2 p-3")}>
                    {b.comment}
                  </p>
                )}
              </div>
            </details>
          ))}
        </section>
      )}
    </div>
  );
}
