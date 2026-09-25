import { publicTournament, publishedRounds } from "@opentab/core";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LiveRefresh } from "@/components/live/live-refresh";
import { db } from "@/lib/db";
import { timeAgo } from "@/lib/utils";

export const revalidate = 60;

export default async function PairingsIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) notFound();
  const rounds = await publishedRounds(db(), data.tournament.id);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Pairings</h1>
        <LiveRefresh slug={slug} types={["round.published", "round.unpublished"]} />
      </div>
      {data.events.map((e) => {
        const rs = rounds.filter((r) => r.eventId === e.id).sort((a, b) => b.seq - a.seq);
        if (rs.length === 0) return null;
        return (
          <section key={e.id} className="space-y-2">
            <h2 className="text-sm font-semibold text-fg-muted">{e.name}</h2>
            <ul className="divide-y divide-border rounded-xl border border-border bg-surface shadow-soft">
              {rs.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/t/${slug}/pairings/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2"
                  >
                    <span className="flex-1 font-medium">{r.label}</span>
                    <span className="text-xs text-fg-subtle">{timeAgo(r.publishedAt)}</span>
                    <ArrowRight className="size-4 text-fg-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {rounds.length === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-fg-muted">
          Nothing posted yet.
        </p>
      )}
    </div>
  );
}
