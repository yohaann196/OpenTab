import { requireTournamentBySlug, tournamentOverview } from "@opentab/core";
import { ArrowRight, CheckCircle2, Circle, PartyPopper } from "lucide-react";
import Link from "next/link";
import { LiveRefresh } from "@/components/live/live-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, PageHeader, Progress, Stat } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { cn, formatDateRange, timeAgo } from "@/lib/utils";

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { slug } = await params;
  const { welcome } = await searchParams;
  const t = await requireTournamentBySlug(db(), slug);
  const o = await tournamentOverview(db(), t.id);
  const base = `/tab/${slug}`;
  const anyRound = o.events.some((e) => e.rounds > 0);
  const checklist = [
    { done: o.events.length > 0, label: "Add events", href: `${base}/setup` },
    { done: o.counts.entries > 0, label: "Import entries", href: `${base}/data/entries` },
    { done: o.counts.judges > 0, label: "Import judges", href: `${base}/data/judges` },
    { done: o.counts.rooms > 0, label: "Add rooms", href: `${base}/data/rooms` },
    { done: o.counts.links > 0, label: "Create judge & entry links", href: `${base}/links` },
    {
      done: anyRound,
      label: "Pair round 1",
      href: o.events[0] ? `${base}/events/${o.events[0].id}` : `${base}/setup`,
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={formatDateRange(t.startsOn, t.endsOn) + (t.location ? ` · ${t.location}` : "")}
        title={t.name}
        actions={
          <>
            <LiveRefresh
              slug={slug}
              types={["ballot.updated", "round.published", "round.updated"]}
            />
            <Button asChild variant="secondary" size="sm">
              <Link href={`/t/${slug}`} target="_blank">
                View public site
              </Link>
            </Button>
          </>
        }
      />

      {welcome && (
        <Alert tone="success" icon={PartyPopper} title="Your tournament is ready">
          Work through the checklist below. Everything imports from CSV, and you can pair round 1 as
          soon as entries, judges and rooms are in.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active entries" value={o.counts.entries} />
        <Stat label="Judges" value={o.counts.judges} />
        <Stat label="Rooms" value={o.counts.rooms} />
        <Stat label="Schools" value={o.counts.schools} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="space-y-3" aria-labelledby="events-heading">
          <h2 id="events-heading" className="text-sm font-semibold text-fg-muted">
            Events
          </h2>
          {o.events.length === 0 && (
            <Card>
              <CardContent className="text-sm text-fg-muted">
                No events yet.{" "}
                <Link href={`${base}/setup`} className="text-brand hover:underline">
                  Add one in Setup
                </Link>
                .
              </CardContent>
            </Card>
          )}
          {o.events.map((e) => {
            const r = e.latest;
            const pct = e.ballots.total ? (e.ballots.in / e.ballots.total) * 100 : 0;
            return (
              <Card key={e.id} className="transition hover:shadow-lift">
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge tone="brand">{e.abbreviation}</Badge>
                      <h3 className="truncate font-semibold">{e.name}</h3>
                    </div>
                    <p className="text-sm text-fg-muted">
                      {e.entries} entries · {e.rounds} round{e.rounds === 1 ? "" : "s"}
                      {r && (
                        <>
                          {" "}
                          · latest <span className="font-medium text-fg">{r.label}</span>{" "}
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
                        </>
                      )}
                    </p>
                    {r && r.status !== "draft" && e.ballots.total > 0 && (
                      <div className="flex items-center gap-3 pt-1">
                        <Progress
                          value={pct}
                          tone={pct === 100 ? "success" : "brand"}
                          className="max-w-56"
                        />
                        <span className="text-xs tabular text-fg-muted">
                          {e.ballots.in}/{e.ballots.total} ballots
                        </span>
                      </div>
                    )}
                  </div>
                  <Button
                    asChild
                    variant={r?.status === "draft" ? "primary" : "secondary"}
                    size="sm"
                  >
                    <Link
                      href={r ? `${base}/events/${e.id}/rounds/${r.id}` : `${base}/events/${e.id}`}
                    >
                      {!r
                        ? "Pair round 1"
                        : r.status === "draft"
                          ? "Continue draft"
                          : r.status === "published"
                            ? "Ballots & draw"
                            : "Next round"}
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </section>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Setup checklist</CardTitle>
              <CardDescription>
                {doneCount}/{checklist.length} done
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 py-2">
              <Progress
                value={(doneCount / checklist.length) * 100}
                tone={doneCount === checklist.length ? "success" : "brand"}
                className="mb-3"
              />
              {checklist.map((c) => (
                <Link
                  key={c.label}
                  href={c.href}
                  className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 text-sm hover:bg-surface-2"
                >
                  {c.done ? (
                    <CheckCircle2 className="size-4 text-success" aria-label="Done" />
                  ) : (
                    <Circle className="size-4 text-fg-subtle" aria-label="To do" />
                  )}
                  <span
                    className={cn(c.done && "text-fg-muted line-through decoration-fg-subtle/50")}
                  >
                    {c.label}
                  </span>
                  {!c.done && (
                    <ArrowRight className="ml-auto size-3.5 text-fg-subtle" aria-hidden />
                  )}
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
            </CardHeader>
            <CardContent className="py-2">
              {o.recent.length === 0 ? (
                <p className="py-2 text-sm text-fg-muted">Nothing yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {o.recent.map((a) => (
                    <li key={a.id} className="py-2 text-sm">
                      <div className="truncate">{a.summary}</div>
                      <div className="text-xs text-fg-subtle">
                        {a.actorLabel} · {timeAgo(a.createdAt)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`${base}/audit`}
                className="mt-2 inline-block text-xs text-brand hover:underline"
              >
                View all activity
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
