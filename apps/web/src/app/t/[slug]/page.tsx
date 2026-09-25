import { currentPairings, publicTournament } from "@opentab/core";
import { FORMAT_LABELS } from "@opentab/engine";
import { ArrowRight, Megaphone, Trophy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live/live-refresh";
import { PushToggle } from "@/components/portal/push-toggle";
import { FindMe } from "@/components/public/find-me";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/utils";

export const revalidate = 15;

/** Render on first visit, then serve from cache (ISR) — invalidated on publish. */
export async function generateStaticParams() {
  return [];
}

export default async function PublicHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) notFound();
  const current = await currentPairings(db(), data.tournament.id);
  return (
    <div className="space-y-8">
      {data.tournament.description && (
        <p className="max-w-2xl text-pretty text-fg-muted">{data.tournament.description}</p>
      )}
      <FindMe slug={slug} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Latest rounds</h2>
          <LiveRefresh
            slug={slug}
            types={["round.published", "motion.released", "standings.published"]}
            announce={{ "round.published": "New pairings are out" }}
          />
        </div>
        {current.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong p-6 text-center text-sm text-fg-muted">
            No pairings posted yet. This page updates automatically.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {current.map((s) => (
              <li key={s.round.id}>
                <Link
                  href={`/t/${slug}/pairings/${s.round.id}`}
                  className="group block rounded-xl border border-border bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="brand">{s.round.eventAbbr}</Badge>
                    <span className="text-xs text-fg-subtle">
                      posted {timeAgo(s.round.publishedAt)}
                    </span>
                  </div>
                  <div className="mt-2 font-semibold group-hover:text-brand">
                    {s.round.eventName} · {s.round.label}
                  </div>
                  <div className="mt-1 text-sm text-fg-muted">
                    {s.debates.filter((d) => !d.bye).length}{" "}
                    {s.round.format === "congress" ? "chambers" : "debates"}
                    {s.round.motion && (
                      <span className="mt-1 flex items-start gap-1.5">
                        <Megaphone className="mt-0.5 size-3.5 shrink-0" aria-hidden />{" "}
                        {s.round.motion}
                      </span>
                    )}
                  </div>
                  <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand">
                    View pairings <ArrowRight className="size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Events</h2>
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-soft">
          {data.events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <Badge tone="brand">{e.abbreviation}</Badge>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{e.name}</div>
                <div className="text-xs text-fg-muted">{FORMAT_LABELS[e.format]}</div>
              </div>
              <Link
                href={`/t/${slug}/results/${e.id}`}
                className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
              >
                <Trophy className="size-4" aria-hidden /> Results
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <PushToggle
        slug={slug}
        targetType="tournament"
        targetId={data.tournament.id}
        label="Get a notification whenever a round is posted"
      />
    </div>
  );
}
