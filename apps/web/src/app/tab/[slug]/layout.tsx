import { listEvents, requireTournamentBySlug } from "@opentab/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/logo";
import { CommandPalette, MobileNav, SidebarNav } from "@/components/tab/tab-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { UserMenu } from "@/components/user-menu";
import { db } from "@/lib/db";
import { getSession, requireStaff } from "@/lib/session";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const t = await db().query.tournament.findFirst({ where: (t, { eq }) => eq(t.slug, slug) });
  return { title: t ? `Tab · ${t.name}` : "Tab room" };
}

export default async function TournamentTabLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug).catch(() => null);
  if (!t) notFound();
  const { role } = await requireStaff(t.id);
  const events = await listEvents(db(), t.id);
  const session = await getSession();
  const navEvents = events.map((e) => ({
    id: e.id,
    name: e.name,
    abbreviation: e.abbreviation,
    format: e.format,
  }));
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15.5rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface-2/70 lg:flex">
        <div className="flex h-14 items-center px-4">
          <Logo href="/tab" />
        </div>
        <div className="px-3 pb-3">
          <div className="rounded-lg border border-border bg-surface px-3 py-2 shadow-soft">
            <div className="truncate text-sm font-semibold" title={t.name}>
              {t.name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-xs capitalize text-fg-muted">
              <Badge tone={t.status === "live" ? "success" : "neutral"}>{t.status}</Badge> {role}
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <SidebarNav slug={slug} events={navEvents} />
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-4 backdrop-blur-lg sm:px-6">
          <MobileNav slug={slug} events={navEvents} title={t.name} />
          <span className="truncate text-sm font-semibold lg:hidden">{t.name}</span>
          <CommandPalette slug={slug} events={navEvents} />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {session && <UserMenu name={session.user.name} email={session.user.email} />}
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
