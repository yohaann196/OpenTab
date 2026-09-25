import {
  Accessibility,
  BellRing,
  Braces,
  CalendarClock,
  ClipboardCheck,
  Command,
  FileSpreadsheet,
  GitBranch,
  History,
  KeyRound,
  Landmark,
  type LucideIcon,
  Moon,
  MousePointerClick,
  Radio,
  Scale,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
  WifiOff,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Features" };

const GROUPS: { title: string; blurb: string; items: [LucideIcon, string, string][] }[] = [
  {
    title: "Pairing & tabulation",
    blurb: "A pure, deterministic engine with real optimization and explanations.",
    items: [
      [
        Scale,
        "Global power-matching",
        "High–low or high–high inside brackets with minimal pull-ups, solved as one min-cost perfect matching.",
      ],
      [
        GitBranch,
        "Side rules that match your format",
        "Side-locked flips for LD and Policy, side balancing, or in-room coin flips for PF.",
      ],
      [
        Users,
        "Judge placement with MPJ",
        "Ordinal or tiered prefs, strikes, mutuality, pref ceilings, obligations and flights via min-cost flow.",
      ],
      [
        Sparkles,
        "“Why this pairing?”",
        "Every debate lists the costs the engine weighed; every standing explains which tiebreak separated it.",
      ],
      [
        Trophy,
        "Elims & brackets",
        "Partial brackets with top-seed byes, sides from prior meetings or coin flips, closeout detection.",
      ],
      [
        Landmark,
        "Congress",
        "Chambers spread by school and seed, persistent across sessions, rank/reciprocal tiebreaks, super sessions.",
      ],
    ],
  },
  {
    title: "The tab room",
    blurb: "Fast, calm and keyboard-friendly for the busiest hour of the day.",
    items: [
      [
        MousePointerClick,
        "Drag-and-drop draw editor",
        "Swap teams and judges, change rooms, lock debates, with live checks as you edit.",
      ],
      [
        ShieldCheck,
        "Pre-publish checks",
        "Double-booked judges and rooms, conflicts, strikes, same school, rematches, accessibility — before anyone sees it.",
      ],
      [
        History,
        "Undo anything",
        "Every change is in the audit log, and any draw edit can be undone from the round's history.",
      ],
      [
        CalendarClock,
        "Scheduled publishing",
        "Publish now or at a set time; notifications go out automatically.",
      ],
      [
        ClipboardCheck,
        "Live ballot board",
        "See who has started and submitted, confirm ballots, handle correction requests, nag missing judges.",
      ],
      [Command, "Command palette", "⌘K to jump to any event, round or data table."],
    ],
  },
  {
    title: "Judges, competitors & coaches",
    blurb: "Designed for phones, hallways and bad Wi-Fi.",
    items: [
      [
        KeyRound,
        "Private links & QR cards",
        "No accounts to link. Print QR cards at registration or email links in one click.",
      ],
      [
        Smartphone,
        "Phone-first ballots",
        "Steppers for points, live totals, inline validation and a review screen before submitting.",
      ],
      [
        WifiOff,
        "Offline-tolerant",
        "Ballots autosave on the device and submit automatically when the connection returns.",
      ],
      [
        BellRing,
        "Push notifications",
        "Follow an entry, judge or school and get a notification the moment pairings are posted.",
      ],
      [
        Radio,
        "Live everything",
        "Pairings, ballots and standings update in place over a single streaming connection.",
      ],
      [
        Accessibility,
        "Accessible by default",
        "Keyboard navigation, screen-reader labels, colour-independent side labels and reduced-motion support.",
      ],
    ],
  },
  {
    title: "Data & operations",
    blurb: "Your data is yours, and the platform stays up.",
    items: [
      [
        FileSpreadsheet,
        "CSV in, CSV out",
        "Import schools, entries, judges and rooms with automatic column matching and a preview. Export anything.",
      ],
      [
        Braces,
        "Open JSON API",
        "Documented, cacheable, rate-limited public API for pairings, standings and brackets.",
      ],
      [
        ShieldCheck,
        "Privacy controls",
        "Show entry codes only, hide individual competitors, and revoke links at any time.",
      ],
      [Moon, "Light & dark", "Every screen is designed for both."],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-16 px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Features</p>
        <h1 className="text-balance text-4xl font-semibold tracking-tight">
          Everything a debate tournament needs — and nothing it doesn&apos;t.
        </h1>
        <p className="text-pretty text-fg-muted">
          From the first CSV import to the final round&apos;s ballots, OpenTab keeps the tab room
          fast and everyone else informed.
        </p>
      </div>
      {GROUPS.map((g) => (
        <section key={g.title} className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">{g.title}</h2>
            <p className="text-fg-muted">{g.blurb}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map(([Icon, title, body]) => (
              <div
                key={title}
                className="rounded-xl border border-border bg-surface p-5 shadow-soft"
              >
                <Icon className="size-5 text-brand" aria-hidden />
                <h3 className="mt-3 font-semibold">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-fg-muted">{body}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="flex justify-center gap-3">
        <Button asChild size="lg">
          <Link href="/sign-up">Run a tournament</Link>
        </Button>
        <Button asChild size="lg" variant="secondary">
          <Link href="/docs">Read the guide</Link>
        </Button>
      </div>
    </div>
  );
}
