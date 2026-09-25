import { listPublicTournaments } from "@opentab/core";
import { CalendarDays, MapPin, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/utils";

export const metadata: Metadata = { title: "Tournaments" };

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const list = await listPublicTournaments(db(), { q, limit: 100 });
  const live = list.filter((t) => t.status === "live");
  const rest = list.filter((t) => t.status !== "live");
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-12 sm:px-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Tournaments</h1>
        <p className="text-fg-muted">
          Find your tournament to see live pairings, results and judge paradigms.
        </p>
      </div>
      <form className="relative max-w-xl">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-fg-subtle"
          aria-hidden
        />
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or city"
          aria-label="Search tournaments"
          className="h-12 w-full rounded-xl border border-border bg-surface pl-11 pr-4 text-base shadow-soft outline-none focus:border-brand focus:ring-4 focus:ring-ring/40"
        />
      </form>
      {list.length === 0 ? (
        <EmptyState icon={Search} title="No tournaments found" />
      ) : (
        <>
          {live.length > 0 && <TournamentGrid title="Happening now" items={live} />}
          {rest.length > 0 && (
            <TournamentGrid
              title={live.length ? "Other tournaments" : "All tournaments"}
              items={rest}
            />
          )}
        </>
      )}
    </div>
  );
}

function TournamentGrid({
  title,
  items,
}: {
  title: string;
  items: Awaited<ReturnType<typeof listPublicTournaments>>;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-fg-muted">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((t) => (
          <li key={t.id}>
            <Link
              href={`/t/${t.slug}`}
              className="group block rounded-xl border border-border bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold tracking-tight group-hover:text-brand">{t.name}</h3>
                {t.status === "live" && (
                  <Badge tone="success">
                    <span className="size-1.5 animate-pulse-dot rounded-full bg-success" /> Live
                  </Badge>
                )}
              </div>
              <div className="mt-3 space-y-1 text-sm text-fg-muted">
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4" aria-hidden />{" "}
                  {formatDateRange(t.startsOn, t.endsOn)}
                </div>
                {t.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4" aria-hidden /> {t.location}
                  </div>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
