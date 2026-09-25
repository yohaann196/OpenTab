"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command } from "cmdk";
import {
  Activity,
  Building2,
  CalendarRange,
  DoorOpen,
  ExternalLink,
  Gavel,
  LayoutDashboard,
  Link2,
  Menu,
  Search,
  Settings,
  ShieldAlert,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Dialog, SheetContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export interface NavEvent {
  id: string;
  name: string;
  abbreviation: string;
  format: string;
}

function useItems(slug: string, events: NavEvent[]) {
  const base = `/tab/${slug}`;
  return {
    main: [
      { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
      { href: `${base}/setup`, label: "Setup", icon: Settings },
    ],
    data: [
      { href: `${base}/data/schools`, label: "Schools", icon: Building2 },
      { href: `${base}/data/entries`, label: "Entries", icon: Users },
      { href: `${base}/data/judges`, label: "Judges", icon: Gavel },
      { href: `${base}/data/rooms`, label: "Rooms", icon: DoorOpen },
      { href: `${base}/data/conflicts`, label: "Conflicts", icon: ShieldAlert },
    ],
    events: events.map((e) => ({
      href: `${base}/events/${e.id}`,
      label: e.name,
      abbr: e.abbreviation,
      icon: CalendarRange,
    })),
    more: [
      { href: `${base}/links`, label: "Private links", icon: Link2 },
      { href: `${base}/audit`, label: "Activity", icon: Activity },
    ],
  };
}

function NavLink({
  href,
  label,
  icon: Icon,
  exact,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof Users;
  exact?: boolean;
  badge?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition",
        active
          ? "bg-surface font-medium text-fg shadow-soft ring-1 ring-border"
          : "text-fg-muted hover:bg-surface/70 hover:text-fg",
      )}
    >
      <Icon
        className={cn(
          "size-4 shrink-0",
          active ? "text-brand" : "text-fg-subtle group-hover:text-fg-muted",
        )}
        aria-hidden
      />
      <span className="truncate">{label}</span>
      {badge && (
        <span className="ml-auto rounded bg-surface-3 px-1.5 text-[10px] font-semibold text-fg-muted">
          {badge}
        </span>
      )}
    </Link>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      {title && (
        <div className="px-2.5 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-wider text-fg-subtle">
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function SidebarNav({
  slug,
  events,
  onNavigate,
}: {
  slug: string;
  events: NavEvent[];
  onNavigate?: () => void;
}) {
  const items = useItems(slug, events);
  return (
    <nav aria-label="Tab room" className="space-y-1">
      <Section>
        {items.main.map((i) => (
          <NavLink key={i.href} {...i} onNavigate={onNavigate} />
        ))}
      </Section>
      <Section title="Events">
        {items.events.length === 0 && (
          <p className="px-2.5 text-xs text-fg-subtle">No events yet.</p>
        )}
        {items.events.map((i) => (
          <NavLink
            key={i.href}
            href={i.href}
            label={i.label}
            icon={Trophy}
            badge={i.abbr}
            onNavigate={onNavigate}
          />
        ))}
      </Section>
      <Section title="Data">
        {items.data.map((i) => (
          <NavLink key={i.href} {...i} onNavigate={onNavigate} />
        ))}
      </Section>
      <Section title="Tools">
        {items.more.map((i) => (
          <NavLink key={i.href} {...i} onNavigate={onNavigate} />
        ))}
        <Link
          href={`/t/${slug}`}
          target="_blank"
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-fg-muted hover:bg-surface/70 hover:text-fg"
        >
          <ExternalLink className="size-4 text-fg-subtle" aria-hidden /> Public site
        </Link>
      </Section>
    </nav>
  );
}

export function MobileNav({
  slug,
  events,
  title,
}: {
  slug: string;
  events: NavEvent[];
  title: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2 lg:hidden"
        aria-label="Open navigation"
      >
        <Menu className="size-5" />
      </DialogPrimitive.Trigger>
      <SheetContent side="left" title={title}>
        <SidebarNav slug={slug} events={events} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Dialog>
  );
}

export function CommandPalette({ slug, events }: { slug: string; events: NavEvent[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const items = useItems(slug, events);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };
  const groups: [string, { href: string; label: string }[]][] = [
    ["Go to", [...items.main, ...items.more]],
    [
      "Events",
      events.flatMap((e) => [
        { href: `/tab/${slug}/events/${e.id}`, label: `${e.name} — rounds` },
        { href: `/tab/${slug}/events/${e.id}/standings`, label: `${e.name} — standings` },
        { href: `/tab/${slug}/events/${e.id}/elims`, label: `${e.name} — break & bracket` },
      ]),
    ],
    ["Data", items.data],
  ];
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-8 w-64 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg-subtle shadow-soft transition hover:text-fg-muted md:flex"
      >
        <Search className="size-4" aria-hidden />
        Jump to…
        <span className="ml-auto flex gap-0.5">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in" />
          <DialogPrimitive.Content className="fixed left-1/2 top-[18%] z-50 w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-lift data-[state=open]:animate-slide-up">
            <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              Search pages and events
            </DialogPrimitive.Description>
            <Command
              label="Command palette"
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle"
            >
              <div className="flex items-center gap-2 border-b border-border px-3">
                <Search className="size-4 text-fg-subtle" aria-hidden />
                <Command.Input
                  autoFocus
                  placeholder="Search pages, events…"
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-fg-subtle"
                />
              </div>
              <Command.List className="max-h-80 overflow-y-auto p-1.5">
                <Command.Empty className="p-6 text-center text-sm text-fg-muted">
                  No results.
                </Command.Empty>
                {groups.map(([heading, list]) => (
                  <Command.Group key={heading} heading={heading}>
                    {list.map((i) => (
                      <Command.Item
                        key={i.href}
                        value={i.label}
                        onSelect={() => go(i.href)}
                        className="cursor-pointer rounded-md px-3 py-2 text-sm aria-selected:bg-surface-2"
                      >
                        {i.label}
                      </Command.Item>
                    ))}
                  </Command.Group>
                ))}
              </Command.List>
            </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
