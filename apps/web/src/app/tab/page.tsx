import { listMyTournaments } from "@opentab/core";
import { CalendarDays, MapPin, Plus, Trophy } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { UserMenu } from "@/components/user-menu";
import { db } from "@/lib/db";
import { getSession, requireUser } from "@/lib/session";
import { formatDateRange } from "@/lib/utils";

export const metadata: Metadata = { title: "My tournaments" };

const STATUS_TONE = {
  setup: "neutral",
  live: "success",
  completed: "brand",
  archived: "neutral",
} as const;

export default async function TabHome() {
  const actor = await requireUser("/tab");
  const session = await getSession();
  const tournaments = await listMyTournaments(db(), actor.userId);
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface/70 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <Logo href="/tab" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <UserMenu name={session!.user.name} email={session!.user.email} />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-5xl space-y-8 px-4 py-10 sm:px-6">
        <PageHeader
          title={`Hi, ${actor.name.split(" ")[0]}`}
          description="Tournaments you run or help tab."
          actions={
            <Button asChild>
              <Link href="/tab/new">
                <Plus /> New tournament
              </Link>
            </Button>
          }
        />
        {tournaments.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No tournaments yet"
            action={
              <Button asChild>
                <Link href="/tab/new">
                  <Plus /> Create your first tournament
                </Link>
              </Button>
            }
          >
            Set one up in about two minutes — pick your events from presets and import your entries
            from CSV.
          </EmptyState>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tournaments.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tab/${t.slug}`}
                  className="group block rounded-xl border border-border bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="font-semibold tracking-tight group-hover:text-brand">
                      {t.name}
                    </h2>
                    <Badge tone={STATUS_TONE[t.status]}>{t.status}</Badge>
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
                  <div className="mt-4 text-xs capitalize text-fg-subtle">Your role: {t.role}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
