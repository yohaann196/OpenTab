import { publicTournament, publishedBracket, publishedStandings } from "@opentab/core";
import { BarChart3 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live/live-refresh";
import { BracketView } from "@/components/results/bracket-view";
import { StandingsTable } from "@/components/results/standings-table";
import { EmptyState } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";

export const revalidate = 60;

export default async function PublicResults({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const data = await publicTournament(db(), slug);
  if (!data || !data.events.some((e) => e.id === eventId)) notFound();
  const [standings, bracket] = await Promise.all([
    publishedStandings(db(), eventId),
    publishedBracket(db(), eventId),
  ]);
  const showStandings = standings && data.tournament.settings?.publicStandings !== false;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
        <LiveRefresh slug={slug} types={["standings.published"]} />
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Events">
        {data.events.map((e) => (
          <Link
            key={e.id}
            href={`/t/${slug}/results/${e.id}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition",
              e.id === eventId
                ? "border-brand bg-brand-soft font-medium text-brand-soft-fg"
                : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {e.abbreviation}
          </Link>
        ))}
      </nav>
      {bracket && bracket.rounds.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold">Elimination bracket</h2>
          <BracketView data={bracket} />
        </section>
      )}
      {showStandings ? (
        <section className="space-y-3">
          <h2 className="font-semibold">
            Standings{standings.throughRound ? ` after ${standings.throughRound}` : ""}
          </h2>
          <StandingsTable view={standings} />
        </section>
      ) : (
        !bracket && (
          <EmptyState icon={BarChart3} title="No results posted yet">
            The tab room publishes standings when they&apos;re ready.
          </EmptyState>
        )
      )}
    </div>
  );
}
