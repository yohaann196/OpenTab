import { computeStandings, getEvent, publishedStandings } from "@opentab/core";
import { BarChart3, Download } from "lucide-react";
import { StandingsTable } from "@/components/results/standings-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { withBase } from "@/lib/paths";
import { PublishStandingsButtons } from "./publish-buttons";

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; eventId: string }>;
  searchParams: Promise<{ stage?: string }>;
}) {
  const { slug, eventId } = await params;
  const { stage } = await searchParams;
  const ev = await getEvent(db(), eventId);
  const superSession = ev.format === "congress" && stage === "elim";
  const [view, published] = await Promise.all([
    computeStandings(db(), eventId, { stage: superSession ? "elim" : "prelim" }),
    publishedStandings(db(), eventId),
  ]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg-muted">
          {view.throughRound ? `Live standings through ${view.throughRound}.` : "No rounds yet."}{" "}
          Hover the <span aria-hidden>ⓘ</span> icon to see why each entry is placed where it is.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="sm">
            <a href={withBase(`/api/tab/${slug}/export/standings?event=${eventId}`)}>
              <Download /> CSV
            </a>
          </Button>
          {ev.format !== "congress" && (
            <Button asChild variant="ghost" size="sm">
              <a href={withBase(`/api/tab/${slug}/export/speakers?event=${eventId}`)}>
                <Download /> Speakers CSV
              </a>
            </Button>
          )}
          <PublishStandingsButtons slug={slug} eventId={eventId} published={!!published} />
        </div>
      </div>
      {ev.format === "congress" && (
        <nav className="flex gap-2" aria-label="Stage">
          <a
            href="?stage=prelim"
            className={`rounded-full border px-3 py-1 text-sm ${superSession ? "border-border text-fg-muted" : "border-brand bg-brand-soft font-medium text-brand-soft-fg"}`}
          >
            Prelim sessions
          </a>
          <a
            href="?stage=elim"
            className={`rounded-full border px-3 py-1 text-sm ${superSession ? "border-brand bg-brand-soft font-medium text-brand-soft-fg" : "border-border text-fg-muted"}`}
          >
            Super session
          </a>
        </nav>
      )}
      {view.rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No entries yet" />
      ) : (
        <StandingsTable view={view} />
      )}
    </div>
  );
}
