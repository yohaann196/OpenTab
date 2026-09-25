import { publicTournament } from "@opentab/core";
import { CalendarDays, MapPin, Megaphone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/logo";
import { PublicNav } from "@/components/public/public-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { formatDateRange } from "@/lib/utils";

export const revalidate = 60;

/** Render on first visit, then serve from cache (ISR) — invalidated on publish. */
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) return { title: "Tournament not found" };
  const t = data.tournament;
  return {
    title: { default: t.name, template: `%s · ${t.name}` },
    description: `Live pairings, results and judge paradigms for ${t.name}${t.location ? ` in ${t.location}` : ""}.`,
    robots: t.visibility === "unlisted" ? { index: false } : undefined,
  };
}

export default async function PublicTournamentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) notFound();
  const t = data.tournament;
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface/70 backdrop-blur-lg">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <div className="flex h-14 items-center gap-3">
            <Link href="/" aria-label="OpenTab home">
              <LogoMark className="size-6" />
            </Link>
            <span className="text-border-strong" aria-hidden>
              /
            </span>
            <Link href={`/t/${slug}`} className="min-w-0 truncate font-semibold tracking-tight">
              {t.name}
            </Link>
            {t.status === "live" && (
              <Badge tone="success" className="hidden sm:inline-flex">
                <span className="size-1.5 animate-pulse-dot rounded-full bg-success" /> Live
              </Badge>
            )}
            <div className="ml-auto">
              <ThemeToggle />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pb-2 text-xs text-fg-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" aria-hidden />{" "}
              {formatDateRange(t.startsOn, t.endsOn)}
            </span>
            {t.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {t.location}
              </span>
            )}
          </div>
          <PublicNav slug={slug} />
        </div>
      </header>
      {t.settings?.announcement && (
        <div className="border-b border-brand/20 bg-brand-soft">
          <p className="mx-auto flex max-w-5xl items-start gap-2 px-4 py-2.5 text-sm text-brand-soft-fg sm:px-6">
            <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden /> {t.settings.announcement}
          </p>
        </div>
      )}
      <main id="main" className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
      <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-fg-subtle sm:px-6">
        Powered by{" "}
        <Link href="/" className="font-medium text-fg-muted hover:text-fg">
          OpenTab
        </Link>{" "}
        · Data also available via the{" "}
        <Link href={`/api/v1/public/t/${slug}`} className="underline underline-offset-2">
          public API
        </Link>
      </footer>
    </div>
  );
}
