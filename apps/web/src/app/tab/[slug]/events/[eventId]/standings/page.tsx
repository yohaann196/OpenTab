import { computeStandings, getEvent, publishedStandings } from "@opentab/core";
import { BarChart3, Download } from "lucide-react";
import { StandingsTable } from "@/components/results/standings-table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { PublishStandingsButtons } from "./publish-buttons";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const ev = await getEvent(db(), eventId);
  const [view, published] = await Promise.all([
    computeStandings(db(), eventId),
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
            <a href={`/api/tab/${slug}/export/standings?event=${eventId}`}>
              <Download /> CSV
            </a>
          </Button>
          {ev.format !== "congress" && (
            <Button asChild variant="ghost" size="sm">
              <a href={`/api/tab/${slug}/export/speakers?event=${eventId}`}>
                <Download /> Speakers CSV
              </a>
            </Button>
          )}
          <PublishStandingsButtons slug={slug} eventId={eventId} published={!!published} />
        </div>
      </div>
      {view.rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No entries yet" />
      ) : (
        <StandingsTable view={view} />
      )}
    </div>
  );
}
