"use client";

import { FORMAT_LABELS, type Format, PRESET_DESCRIPTIONS } from "@opentab/engine";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gavel,
  Landmark,
  Loader2,
  MessagesSquare,
  Plus,
  Scale,
  Trash2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { checkSlugAction, createTournamentAction } from "../actions";

const FORMAT_ICONS: Record<Format, typeof Scale> = {
  ld: Scale,
  pf: MessagesSquare,
  policy: Gavel,
  congress: Landmark,
  world_schools: Users,
};

const DEFAULT_ABBR: Record<Format, string> = {
  ld: "LD",
  pf: "PF",
  policy: "CX",
  congress: "CON",
  world_schools: "WS",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Phoenix",
  "America/Los_Angeles",
  "America/Anchorage",
  "Pacific/Honolulu",
  "Europe/London",
  "Asia/Singapore",
  "Australia/Sydney",
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}

type EventDraft = { key: number; format: Format; name: string; abbreviation: string };

export function NewTournamentWizard() {
  const router = useRouter();
  const { exec, pending } = useAction();
  const [step, setStep] = useState(0);
  const today = new Date().toISOString().slice(0, 10);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugOk, setSlugOk] = useState<boolean | null>(null);
  const [startsOn, setStartsOn] = useState(today);
  const [endsOn, setEndsOn] = useState(today);
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
    } catch {
      return "America/Chicago";
    }
  });
  const [events, setEvents] = useState<EventDraft[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugTouched) setSlug(slugify(name));
  }, [name, slugTouched]);

  useEffect(() => {
    if (slug.length < 3) {
      setSlugOk(null);
      return;
    }
    const t = setTimeout(async () => setSlugOk(await checkSlugAction(slug)), 350);
    return () => clearTimeout(t);
  }, [slug]);

  const basicsValid =
    name.trim().length >= 3 && slug.length >= 3 && slugOk !== false && endsOn >= startsOn;
  const tzOptions = useMemo(
    () => (TIMEZONES.includes(timezone) ? TIMEZONES : [timezone, ...TIMEZONES]),
    [timezone],
  );

  const addEvent = (format: Format) =>
    setEvents((prev) => {
      const count = prev.filter((e) => e.format === format).length;
      return [
        ...prev,
        {
          key: Date.now() + Math.random(),
          format,
          name: count
            ? `${FORMAT_LABELS[format]} ${count + 1}`
            : `Varsity ${FORMAT_LABELS[format]}`,
          abbreviation: count ? `${DEFAULT_ABBR[format]}${count + 1}` : DEFAULT_ABBR[format],
        },
      ];
    });

  async function create() {
    setError(null);
    const res = await exec(
      () =>
        createTournamentAction({
          name,
          slug,
          startsOn,
          endsOn,
          location: location || undefined,
          timezone,
          events: events.map(({ format, name: n, abbreviation }) => ({
            format,
            name: n,
            abbreviation,
          })),
          timeslots: 0,
        }),
      { success: "Tournament created" },
    );
    if (res.ok) router.push(`/tab/${res.data.slug}?welcome=1`);
    else setError(res.error);
  }

  const steps = ["Basics", "Events", "Review"];

  return (
    <div className="space-y-8">
      <ol className="flex items-center gap-2 text-sm" aria-label="Progress">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full border text-xs font-semibold transition",
                i < step
                  ? "border-brand bg-brand text-brand-fg"
                  : i === step
                    ? "border-brand text-brand"
                    : "border-border text-fg-subtle",
              )}
              aria-current={i === step ? "step" : undefined}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn(i === step ? "font-medium" : "text-fg-muted")}>{s}</span>
            {i < steps.length - 1 && <span className="mx-2 h-px w-8 bg-border" aria-hidden />}
          </li>
        ))}
      </ol>

      {error && <Alert tone="danger" title={error} />}

      {step === 0 && (
        <div className="grid gap-5 rounded-xl border border-border bg-surface p-6 shadow-soft">
          <Field label="Tournament name" htmlFor="name">
            <Input
              id="name"
              autoFocus
              placeholder="e.g. Lincoln Fall Classic"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Public URL"
            htmlFor="slug"
            error={slugOk === false ? "That URL is taken or invalid." : null}
            hint={slugOk ? "Available." : "Lowercase letters, numbers and dashes."}
          >
            <div className="flex items-center rounded-md border border-border bg-surface-2 pl-3 text-sm text-fg-muted focus-within:border-brand focus-within:ring-4 focus-within:ring-ring/40">
              <span className="whitespace-nowrap">opentab.app/t/</span>
              <input
                id="slug"
                className="h-9 w-full rounded-r-md bg-surface px-2 text-fg outline-none"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(slugify(e.target.value));
                }}
                aria-invalid={slugOk === false}
              />
              <span className="px-2">
                {slugOk === null && slug.length >= 3 ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : slugOk ? (
                  <Check className="size-4 text-success" />
                ) : null}
              </span>
            </div>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Starts" htmlFor="start">
              <Input
                id="start"
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </Field>
            <Field
              label="Ends"
              htmlFor="end"
              error={endsOn < startsOn ? "Ends before it starts." : null}
            >
              <Input
                id="end"
                type="date"
                value={endsOn}
                min={startsOn}
                onChange={(e) => setEndsOn(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Location" htmlFor="loc" hint="Optional.">
              <Input
                id="loc"
                placeholder="City, State"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
            <Field label="Time zone" htmlFor="tz">
              <NativeSelect id="tz" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {tzOptions.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace("_", " ")}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(Object.keys(FORMAT_LABELS) as Format[]).map((f) => {
              const Icon = FORMAT_ICONS[f];
              const count = events.filter((e) => e.format === f).length;
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => addEvent(f)}
                  className="group relative rounded-xl border border-border bg-surface p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift"
                >
                  <div className="flex items-center justify-between">
                    <Icon className="size-5 text-brand" aria-hidden />
                    {count > 0 ? (
                      <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-fg">
                        {count} added
                      </span>
                    ) : (
                      <Plus className="size-4 text-fg-subtle group-hover:text-brand" aria-hidden />
                    )}
                  </div>
                  <div className="mt-3 font-semibold">{FORMAT_LABELS[f]}</div>
                  <p className="mt-1 text-xs leading-relaxed text-fg-muted">
                    {PRESET_DESCRIPTIONS[f]}
                  </p>
                </button>
              );
            })}
          </div>
          {events.length > 0 ? (
            <div className="divide-y divide-border rounded-xl border border-border bg-surface shadow-soft">
              {events.map((ev) => (
                <div
                  key={ev.key}
                  className="grid items-center gap-3 p-3 sm:grid-cols-[1fr_7rem_auto]"
                >
                  <Input
                    aria-label="Event name"
                    value={ev.name}
                    onChange={(e) =>
                      setEvents((p) =>
                        p.map((x) => (x.key === ev.key ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <Input
                    aria-label="Abbreviation"
                    value={ev.abbreviation}
                    onChange={(e) =>
                      setEvents((p) =>
                        p.map((x) =>
                          x.key === ev.key
                            ? { ...x, abbreviation: e.target.value.toUpperCase().slice(0, 12) }
                            : x,
                        ),
                      )
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${ev.name}`}
                    onClick={() => setEvents((p) => p.filter((x) => x.key !== ev.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-fg-muted">
              Pick one or more formats. You can change any setting later.
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-soft">
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-fg-muted">Tournament</dt>
              <dd className="font-medium">{name}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">URL</dt>
              <dd className="font-mono text-[13px]">/t/{slug}</dd>
            </div>
            <div>
              <dt className="text-fg-muted">Dates</dt>
              <dd className="font-medium">
                {startsOn}
                {endsOn !== startsOn && ` → ${endsOn}`}
              </dd>
            </div>
            <div>
              <dt className="text-fg-muted">Time zone</dt>
              <dd className="font-medium">{timezone}</dd>
            </div>
          </dl>
          <div>
            <div className="text-sm text-fg-muted">Events</div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {events.length === 0 && (
                <li className="text-sm">None yet — you can add events later.</li>
              )}
              {events.map((e) => (
                <li
                  key={e.key}
                  className="rounded-full border border-border bg-surface-2 px-3 py-1 text-sm"
                >
                  <span className="font-medium">{e.abbreviation}</span> · {e.name}
                </li>
              ))}
            </ul>
          </div>
          <Alert tone="brand" title="What happens next">
            You&apos;ll land in your tab room with a checklist: import schools, entries, judges and
            rooms (CSV works), then pair round 1.
          </Alert>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ArrowLeft /> Back
        </Button>
        {step < 2 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={step === 0 && !basicsValid}>
            Continue <ArrowRight />
          </Button>
        ) : (
          <Button onClick={create} loading={pending}>
            Create tournament
          </Button>
        )}
      </div>
    </div>
  );
}
