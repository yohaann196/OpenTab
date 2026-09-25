import {
  ArrowRight,
  BellRing,
  Check,
  CloudLightning,
  Code2,
  Gavel,
  GraduationCap,
  type LucideIcon,
  Minus,
  Scale,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Users,
  Wand2,
  X,
} from "lucide-react";
import Link from "next/link";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <FormatStrip />
      <Problems />
      <EngineSection />
      <Audiences />
      <Comparison />
      <OpenSource />
      <Faq />
      <FinalCta />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_top,black_20%,transparent_70%)] opacity-60" />
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-14 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:pb-24">
        <div className="animate-slide-up space-y-7">
          <Link
            href="/features"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pl-1 pr-3 text-xs text-fg-muted shadow-soft backdrop-blur transition hover:text-fg"
          >
            <span className="rounded-full bg-brand px-2 py-0.5 font-medium text-brand-fg">New</span>
            Open source · Policy, LD, PF, Congress &amp; World Schools
            <ArrowRight className="size-3" />
          </Link>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
            Tabbing that doesn&apos;t crash on{" "}
            <span className="bg-gradient-to-r from-brand to-[oklch(0.62_0.19_320)] bg-clip-text text-transparent">
              Saturday.
            </span>
          </h1>
          <p className="max-w-xl text-pretty text-lg leading-relaxed text-fg-muted">
            OpenTab is modern, open-source tournament software for speech &amp; debate. Pair a round
            in one click, send ballots to judges&apos; phones, and put live pairings in every
            competitor&apos;s pocket — without the 2009 interface.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Run a tournament <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/t/opentab-invitational">Explore the live demo</Link>
            </Button>
          </div>
          <ul className="grid gap-2 text-sm text-fg-muted sm:grid-cols-2">
            {[
              "Free and open source (AGPL)",
              "Phone-first ballots, no judge accounts",
              "Live pairings, push notifications",
              "CSV in, CSV out, open JSON API",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="size-4 text-success" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
}

function FormatStrip() {
  const formats = ["Policy", "Lincoln–Douglas", "Public Forum", "Congress", "World Schools"];
  return (
    <section className="border-y border-border bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-10 gap-y-3 px-4 py-5 text-sm font-medium text-fg-muted sm:px-6">
        <span className="text-xs uppercase tracking-wider text-fg-subtle">Built for</span>
        {formats.map((f) => (
          <span key={f}>{f}</span>
        ))}
      </div>
    </section>
  );
}

const PROBLEMS: { icon: LucideIcon; pain: string; fix: string; body: string }[] = [
  {
    icon: CloudLightning,
    pain: "The site goes down on tournament Saturdays",
    fix: "Published rounds are static snapshots",
    body: "Pairings and results are frozen at publish time and served from cache, so a traffic spike never runs a heavy query. Live updates stream over one connection instead of thousands of refreshes.",
  },
  {
    icon: BellRing,
    pain: "Text blasts stopped arriving",
    fix: "Web Push + email that actually deliver",
    body: "Carrier email-to-SMS gateways are being shut down one by one. OpenTab uses standard browser push notifications and email, sent from a background queue so publishing is instant.",
  },
  {
    icon: Smartphone,
    pain: "“Please use a laptop to submit your ballot”",
    fix: "Ballots designed for a phone",
    body: "Big tap targets, running point totals, autosave, and an offline queue for bad school Wi-Fi. Judges can submit the decision now and finish the RFD later.",
  },
  {
    icon: Users,
    pain: "Judges locked out of their accounts",
    fix: "Private links — no account linking",
    body: "Every judge and entry gets a private link and QR code. Open it, judge, done. Accounts are optional, for people who want history across tournaments.",
  },
  {
    icon: Wand2,
    pain: "Hundreds of settings, zero explanations",
    fix: "Presets, a 2-minute wizard, and plain English",
    body: "Start from NSDA-style presets for each format. Every setting says what it does, and every pairing and tiebreak explains itself.",
  },
  {
    icon: Code2,
    pain: "No API, so everyone scrapes",
    fix: "Open JSON API and full exports",
    body: "Public, documented read API for pairings and results, plus CSV and full JSON exports. Your data is yours — and scrapers get a better option.",
  },
];

function Problems() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading
        eyebrow="Why OpenTab"
        title="Every tab director knows these problems. We designed around them."
      >
        We read years of complaints about the status quo — outages, dead text blasts, laptop-only
        ballots, black-box pairings — and built the fix into the architecture, not a settings page.
      </SectionHeading>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PROBLEMS.map((p) => (
          <article
            key={p.fix}
            className="group rounded-xl border border-border bg-surface p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
          >
            <div className="flex items-center gap-3">
              <div className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand-soft-fg">
                <p.icon className="size-4.5" aria-hidden />
              </div>
              <p className="text-xs font-medium text-fg-subtle line-through decoration-danger/60">
                {p.pain}
              </p>
            </div>
            <h3 className="mt-4 font-semibold tracking-tight">{p.fix}</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{p.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function EngineSection() {
  return (
    <section className="border-y border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
        <div className="space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand">
            The pairing engine
          </p>
          <h2 className="text-balance text-3xl font-semibold tracking-tight">
            One global optimization, not a pile of special cases.
          </h2>
          <p className="text-pretty leading-relaxed text-fg-muted">
            OpenTab pairs a round by solving it as a minimum-cost perfect matching (Edmonds&apos;
            blossom algorithm), and places judges with a min-cost flow. Same-school, rematches, side
            locks, pull-ups, mutual preference and bracket position are all named, weighted costs —
            so the result is optimal, deterministic, and explainable.
          </p>
          <ul className="space-y-3 text-sm">
            {[
              [
                "Explainable",
                "Every debate shows why it was paired: “2 places from ideal, pulled up from the 2–1 bracket.”",
              ],
              [
                "Reproducible",
                "Seeded randomness means the same inputs always produce the same draw — auditable after the fact.",
              ],
              [
                "Fast",
                "300 entries power-matched with judges and rooms placed in well under a second.",
              ],
              [
                "Safe",
                "A pre-publish check catches double-booked judges, conflicts, same-school and inaccessible rooms before anyone sees them.",
              ],
            ].map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                  <Check className="size-3" aria-hidden />
                </span>
                <span>
                  <strong className="font-semibold">{title}.</strong>{" "}
                  <span className="text-fg-muted">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface shadow-lift" aria-hidden>
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Why this pairing?</span>
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-fg-muted">
              Round 5 · 3–1 bracket
            </span>
          </div>
          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between rounded-lg bg-surface-2 p-3 text-sm">
              <span>
                <span className="font-semibold">Hopper MP</span>{" "}
                <span className="text-fg-subtle">(Aff)</span>
              </span>
              <span className="text-fg-subtle">vs</span>
              <span>
                <span className="font-semibold">Tubman RS</span>{" "}
                <span className="text-fg-subtle">(Neg)</span>
              </span>
            </div>
            {[
              ["Bracket position", "1 place from ideal high–low opponent", 10, "bg-brand"],
              ["Side lock", "Both switch sides from round 4 ✓", 0, "bg-success"],
              ["Same school", "Different schools ✓", 0, "bg-success"],
              ["Rematch", "Never met ✓", 0, "bg-success"],
            ].map(([label, detail, cost, color]) => (
              <div
                key={label as string}
                className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm"
              >
                <div>
                  <div className="font-medium">{label}</div>
                  <div className="text-xs text-fg-muted">{detail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
                    <div
                      className={`h-full ${color}`}
                      style={{ width: cost ? "18%" : "100%", opacity: cost ? 1 : 0.35 }}
                    />
                  </div>
                  <span className="w-10 text-right font-mono text-xs tabular text-fg-muted">
                    {cost as number}
                  </span>
                </div>
              </div>
            ))}
            <div className="rounded-lg border border-dashed border-border-strong p-3 text-xs text-fg-muted">
              Judge: <strong className="text-fg">Dana Ortiz</strong> — mutual 1s (8% / 11%),
              hasn&apos;t seen either team, 3/6 rounds judged.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Audiences() {
  const cols: { icon: LucideIcon; title: string; items: string[] }[] = [
    {
      icon: Scale,
      title: "Tab directors",
      items: [
        "Wizard with format presets — ready to import in minutes",
        "CSV import with preview and per-row errors",
        "Drag-and-drop draw editor with live conflict checks",
        "Live ballot board, nag missing judges in one click",
        "Undo any change from the audit log",
      ],
    },
    {
      icon: Gavel,
      title: "Judges",
      items: [
        "One private link or QR code — no account needed",
        "Phone-first ballot with autosave and offline retry",
        "Submit the decision now, finish the RFD later",
        "Request a correction instead of walking to tab",
        "Congress scorer ballot and PO speech tracker",
      ],
    },
    {
      icon: GraduationCap,
      title: "Competitors & coaches",
      items: [
        "“Find me” search: your room, side and judge in one tap",
        "Push notifications the second a round is published",
        "Drag-to-rank pref sheets with live quota counters",
        "Ballots and RFDs when the tab releases them",
        "Standings with tiebreak explanations",
      ],
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-28">
      <SectionHeading
        eyebrow="For everyone in the building"
        title="A better Saturday for the tab room, the judges' lounge, and the hallway."
      />
      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {cols.map((c) => (
          <div key={c.title} className="rounded-xl border border-border bg-surface p-6 shadow-soft">
            <c.icon className="size-6 text-brand" aria-hidden />
            <h3 className="mt-4 text-lg font-semibold tracking-tight">{c.title}</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-fg-muted">
              {c.items.map((i) => (
                <li key={i} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  {i}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

type Cell = true | false | "partial" | string;
const ROWS: [string, Cell, Cell, Cell][] = [
  ["Policy, LD, Public Forum", true, true, "partial"],
  ["Congress (chambers, PO, speech tracking)", true, true, false],
  ["World Schools", true, true, true],
  ["Mutual preference judging (ordinals / tiers)", true, true, false],
  ["Judges vote without an account", true, false, true],
  ["Browser push notifications", true, false, true],
  ["Public read API", true, false, true],
  ["Open source", "AGPL-3.0", "RPL-1.5", "AGPL-3.0"],
];

function CellView({ v }: { v: Cell }) {
  if (v === true) return <Check className="mx-auto size-4 text-success" aria-label="Yes" />;
  if (v === false) return <X className="mx-auto size-4 text-fg-subtle" aria-label="No" />;
  if (v === "partial")
    return <Minus className="mx-auto size-4 text-warning" aria-label="Partial" />;
  return <span className="text-xs text-fg-muted">{v}</span>;
}

function Comparison() {
  return (
    <section className="border-y border-border bg-surface/60">
      <div className="mx-auto max-w-5xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading
          eyebrow="How it compares"
          title="The US formats you run, with the modern workflow you want."
        >
          Tabroom covers every US format but shows its age. Tabbycat is excellent for British
          Parliamentary but has no Congress or MPJ. OpenTab aims for both.
        </SectionHeading>
        <div className="mt-10 overflow-x-auto rounded-xl border border-border bg-surface shadow-soft">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">
              Feature comparison between OpenTab, Tabroom and Tabbycat
            </caption>
            <thead className="bg-surface-2">
              <tr>
                <th scope="col" className="px-4 py-3 text-left font-medium text-fg-muted">
                  Feature
                </th>
                <th scope="col" className="px-4 py-3 text-center font-semibold text-brand">
                  OpenTab
                </th>
                <th scope="col" className="px-4 py-3 text-center font-medium text-fg-muted">
                  Tabroom
                </th>
                <th scope="col" className="px-4 py-3 text-center font-medium text-fg-muted">
                  Tabbycat
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([label, a, b, c]) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {label}
                  </th>
                  <td className="bg-brand-soft/30 px-4 py-3 text-center">
                    <CellView v={a} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellView v={b} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CellView v={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-fg-subtle">
          Based on public documentation as of 2026. Tabroom is a trademark of the National Speech
          &amp; Debate Association; OpenTab is an independent project.
        </p>
      </div>
    </section>
  );
}

function OpenSource() {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:py-28">
      <div className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">Open source</p>
        <h2 className="text-balance text-3xl font-semibold tracking-tight">
          Use ours, or run your own in one command.
        </h2>
        <p className="leading-relaxed text-fg-muted">
          OpenTab is licensed under the AGPL. Leagues and universities can self-host with Docker;
          everyone else can use the hosted site. The tab engine is a standalone, fully tested
          TypeScript package — read it, audit it, improve it.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button asChild variant="secondary">
            <Link href="/docs#self-host">Self-hosting guide</Link>
          </Button>
          <Button asChild variant="ghost">
            <a href="https://github.com/yohaann196/opentab">View source</a>
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-[oklch(0.18_0.02_265)] font-mono text-[13px] text-[oklch(0.9_0.01_265)] shadow-lift">
        <div className="flex gap-1.5 border-b border-white/10 px-4 py-3">
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
          <span className="size-2.5 rounded-full bg-white/20" />
        </div>
        <pre className="overflow-x-auto p-5 leading-6">
          <code>
            <span className="text-white/40"># clone and start everything</span>
            {"\n"}git clone https://github.com/yohaann196/opentab
            {"\n"}cd opentab && docker compose up -d
            {"\n\n"}
            <span className="text-white/40"># → http://localhost:3000</span>
            {"\n"}
            <span className="text-[oklch(0.8_0.14_155)]">✓</span> postgres ready
            {"\n"}
            <span className="text-[oklch(0.8_0.14_155)]">✓</span> migrations applied
            {"\n"}
            <span className="text-[oklch(0.8_0.14_155)]">✓</span> web + worker running
          </code>
        </pre>
      </div>
    </section>
  );
}

const FAQ: [string, string][] = [
  [
    "Is OpenTab free?",
    "Yes. The software is open source under the AGPL-3.0. You can use the hosted site or run it yourself.",
  ],
  [
    "Which formats are supported?",
    "Policy, Lincoln–Douglas, Public Forum, Congress and World Schools, with presets modelled on common NSDA practice. Speech (individual events) and British Parliamentary are on the roadmap.",
  ],
  [
    "Do judges need an account?",
    "No. Every judge gets a private link (and printable QR code). If they sign in with an account later, their ballots follow them.",
  ],
  [
    "Can I import my data?",
    "Yes — schools, entries, judges and rooms import from CSV with automatic column matching, a preview, and per-row error messages.",
  ],
  [
    "How does OpenTab stay up under load?",
    "Public pages read precomputed snapshots that are cheap to cache, live updates use a single streaming connection per device, and heavy work (like notifications) runs in a background queue.",
  ],
  [
    "Is it safe for minors' information?",
    "Tournaments can show entry codes only, and individual competitors can be hidden from public pages. Private links can be revoked any time.",
  ],
];

function Faq() {
  return (
    <section className="border-t border-border bg-surface/60">
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6 lg:py-28">
        <SectionHeading eyebrow="FAQ" title="Questions, answered." />
        <div className="mt-10 divide-y divide-border rounded-xl border border-border bg-surface shadow-soft">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                {q}
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-2 text-fg-muted transition group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-fg-muted">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl bg-brand px-6 py-14 text-center text-brand-fg shadow-lift sm:px-12">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-20" />
        <Sparkles className="relative mx-auto size-8 opacity-80" aria-hidden />
        <h2 className="relative mt-4 text-balance text-3xl font-semibold tracking-tight">
          Run your next tournament on OpenTab.
        </h2>
        <p className="relative mx-auto mt-3 max-w-xl text-pretty opacity-85">
          Set up in minutes, pair in one click, and spend Saturday watching rounds instead of
          refreshing a status page.
        </p>
        <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="bg-white text-[oklch(0.3_0.1_275)] hover:bg-white/90"
          >
            <Link href="/sign-up">
              Create a tournament <ArrowRight />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="text-brand-fg hover:bg-white/10 hover:text-brand-fg"
          >
            <Link href="/t/opentab-invitational">See the demo</Link>
          </Button>
        </div>
        <p className="relative mt-6 inline-flex items-center gap-1.5 text-xs opacity-75">
          <ShieldCheck className="size-3.5" aria-hidden /> No credit card. Your data exports any
          time.
        </p>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>
      <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight">{title}</h2>
      {children && <p className="mt-4 text-pretty leading-relaxed text-fg-muted">{children}</p>}
    </div>
  );
}
