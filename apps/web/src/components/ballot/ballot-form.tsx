"use client";

import {
  type CongressConfig,
  type DebateConfig,
  type Finding,
  isDebateConfig,
  validateCongressBallot,
  validateTwoTeamBallot,
  type WorldSchoolsConfig,
} from "@opentab/engine";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  CloudOff,
  Crown,
  Minus,
  Plus,
  RotateCcw,
  Send,
  Trophy,
  Wifi,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { BallotFormData, SaveFn } from "./types";

type Components = { style: number; content: number; strategy: number };
type SpeakerSlot = {
  competitorId: string;
  points: number | null;
  rank: number | null;
  components: Components | null;
};
type TeamState = {
  speakers: SpeakerSlot[];
  reply: { competitorId: string; components: Components | null } | null;
};
type FormState = {
  winnerId: string | null;
  sides: Record<string, "A" | "B">;
  teams: Record<string, TeamState>;
  rfd: string;
  comments: Record<string, string>;
  congress: {
    speeches: Record<string, number[]>;
    ranks: Record<string, number | null>;
    poEntryId: string | null;
    poPoints: number | null;
  };
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function initialState(d: BallotFormData): FormState {
  const cfg = d.config;
  const teams: Record<string, TeamState> = {};
  if (isDebateConfig(cfg)) {
    for (const e of d.entries) {
      const existing = d.scores
        .filter((s) => s.entryId === e.id && !s.reply)
        .sort((a, b) => a.position - b.position);
      const speakers: SpeakerSlot[] = Array.from({ length: cfg.speakersPerTeam }, (_, i) => {
        const ex = existing[i];
        return {
          competitorId:
            ex?.competitorId ?? e.competitors[i % Math.max(1, e.competitors.length)]?.id ?? "",
          points: ex?.points ?? null,
          rank: ex?.rank ?? null,
          components: ex?.components ?? null,
        };
      });
      const rep = d.scores.find((s) => s.entryId === e.id && s.reply);
      teams[e.id] = {
        speakers,
        reply:
          cfg.format === "world_schools"
            ? {
                competitorId: rep?.competitorId ?? speakers[0]?.competitorId ?? "",
                components: rep?.components ?? null,
              }
            : null,
      };
    }
  }
  const speeches: Record<string, number[]> = {};
  const ranks: Record<string, number | null> = {};
  for (const e of d.entries) {
    speeches[e.id] =
      d.congress?.speeches.filter((s) => s.entryId === e.id).map((s) => s.points) ?? [];
    ranks[e.id] = d.congress?.ranks.find((r) => r.entryId === e.id)?.rank ?? null;
  }
  return {
    winnerId: d.winnerId,
    sides: d.sidesPending
      ? {}
      : Object.fromEntries(d.entries.filter((e) => e.side).map((e) => [e.id, e.side!])),
    teams,
    rfd: d.rfd ?? "",
    comments: d.comments ?? {},
    congress: {
      speeches,
      ranks,
      poEntryId: d.congress?.po?.entryId ?? null,
      poPoints: d.congress?.po?.points ?? null,
    },
  };
}

function toInput(d: BallotFormData, s: FormState) {
  const cfg = d.config;
  if (!isDebateConfig(cfg)) {
    return {
      congress: {
        speeches: Object.entries(s.congress.speeches).flatMap(([entryId, pts]) =>
          pts.map((points) => ({ entryId, points })),
        ),
        ranks: Object.entries(s.congress.ranks)
          .filter(([, r]) => r != null)
          .map(([entryId, rank]) => ({ entryId, rank: rank! })),
        po:
          s.congress.poEntryId && s.congress.poPoints
            ? { entryId: s.congress.poEntryId, points: s.congress.poPoints }
            : null,
      },
      rfd: s.rfd || null,
    };
  }
  const isWs = cfg.format === "world_schools";
  const scores = Object.entries(s.teams).flatMap(([entryId, t]) => {
    const subst = t.speakers.map((sp, i) => {
      const points =
        isWs && sp.components
          ? round2(sp.components.style + sp.components.content + sp.components.strategy)
          : (sp.points ?? 0);
      return {
        entryId,
        competitorId: sp.competitorId,
        position: i + 1,
        reply: false,
        points,
        rank: sp.rank,
        components: isWs ? sp.components : null,
      };
    });
    const reply =
      isWs && t.reply?.components
        ? [
            {
              entryId,
              competitorId: t.reply.competitorId,
              position: cfg.speakersPerTeam + 1,
              reply: true,
              points: round2(
                t.reply.components.style + t.reply.components.content + t.reply.components.strategy,
              ),
              rank: null,
              components: t.reply.components,
            },
          ]
        : [];
    return [...subst, ...reply];
  });
  return {
    winnerId: s.winnerId,
    scores,
    rfd: s.rfd || null,
    comments: s.comments,
    sides: d.sidesPending ? s.sides : undefined,
  };
}

function isComplete(d: BallotFormData, s: FormState) {
  const cfg = d.config;
  if (!isDebateConfig(cfg)) return Object.values(s.congress.ranks).some((r) => r != null);
  const isWs = cfg.format === "world_schools";
  return (
    !!s.winnerId &&
    (!d.sidesPending || d.entries.every((e) => s.sides?.[e.id])) &&
    Object.values(s.teams).every(
      (t) =>
        t.speakers.every((sp) => (isWs ? !!sp.components : sp.points != null) && sp.competitorId) &&
        (!isWs || !!t.reply?.components),
    )
  );
}

// ---------------------------------------------------------------------------

export function BallotForm({
  data,
  save,
  mode = "judge",
  onDone,
}: {
  data: BallotFormData;
  save: SaveFn;
  mode?: "judge" | "tab";
  onDone?: () => void;
}) {
  const cfg = data.config;
  const storageKey = `opentab:ballot:${data.ballotId}:v${data.version}`;
  const [state, setState] = useState<FormState>(() => initialState(data));
  const [restored, setRestored] = useState(false);
  // Restore an unsent local draft after mount (keeps SSR and hydration identical).
  useEffect(() => {
    if (mode !== "judge") return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        setState(JSON.parse(raw) as FormState);
        setRestored(true);
      }
    } catch {}
  }, [mode, storageKey]);
  const [step, setStep] = useState<"edit" | "review" | "done">(
    data.status === "submitted" || data.status === "confirmed" ? "done" : "edit",
  );
  const [serverFindings, setServerFindings] = useState<Finding[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [online, setOnline] = useState(true);
  const [queued, setQueued] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const dirty = useRef(false);

  const input = useMemo(() => toInput(data, state), [data, state]);
  const validation = useMemo(() => {
    if (!isDebateConfig(cfg)) {
      return validateCongressBallot(
        input.congress ?? { speeches: [], ranks: [] },
        data.entries.map((e) => e.id),
        cfg as CongressConfig,
      );
    }
    return validateTwoTeamBallot(
      {
        winnerId: input.winnerId ?? null,
        scores: (input.scores ?? []).map((sc) => ({
          ...sc,
          components: sc.components ?? undefined,
        })),
      },
      {
        entries: data.entries.map((e) => ({ entryId: e.id, side: e.side ?? "A" })),
        competitors: Object.fromEntries(
          data.entries.map((e) => [e.id, e.competitors.map((c) => c.id)]),
        ),
      },
      cfg,
    );
  }, [cfg, data.entries, input]);

  // Local autosave (judge mode): survives refreshes, dead batteries and bad Wi-Fi.
  useEffect(() => {
    if (mode !== "judge" || step === "done") return;
    dirty.current = true;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [state, storageKey, mode, step]);

  // Periodic server draft save.
  const saveDraft = useCallback(async () => {
    if (mode !== "judge" || !dirty.current || step === "done") return;
    dirty.current = false;
    const res = await save({ ...input, acknowledgeWarnings: false }, "draft");
    if (res.ok) setSavedAt(new Date());
    else if ("network" in res && res.network) dirty.current = true;
  }, [input, mode, save, step]);
  useEffect(() => {
    const id = setInterval(saveDraft, 20_000);
    return () => clearInterval(id);
  }, [saveDraft]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    const res = await save({ ...input, acknowledgeWarnings: true }, "submit");
    setSubmitting(false);
    if (res.ok) {
      setQueued(false);
      setStep("done");
      try {
        localStorage.removeItem(storageKey);
      } catch {}
      onDone?.();
      return;
    }
    if ("network" in res && res.network) {
      setQueued(true);
      setError(
        "You're offline. Your ballot is saved on this device and will submit automatically when you reconnect.",
      );
      return;
    }
    setError(res.error);
    setServerFindings(res.findings ?? []);
    setStep("edit");
  }, [input, save, storageKey, onDone, mode]);

  // Offline queue: retry when the connection returns.
  useEffect(() => {
    const on = () => {
      setOnline(true);
      if (queued) void submit();
    };
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [queued, submit]);

  const sideLabel = (side: "A" | "B" | null) =>
    isDebateConfig(cfg) && side ? cfg.sideLabels[side === "A" ? 0 : 1] : "";
  const sideOf = (id: string) =>
    data.sidesPending
      ? (state.sides?.[id] ?? null)
      : (data.entries.find((e) => e.id === id)?.side ?? null);
  const ordered = [...data.entries]
    .map((e) => ({ ...e, side: sideOf(e.id) }))
    .sort((a, b) => (a.side ?? "Z").localeCompare(b.side ?? "Z"));

  if (step === "done") {
    return (
      <div className="space-y-4 rounded-2xl border border-success/30 bg-success-soft p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold">Ballot submitted</h2>
          <p className="mt-1 text-sm text-fg-muted">
            {mode === "tab"
              ? "Entered by the tab room."
              : "Thank you, judge! The tab room has your decision."}
            {isDebateConfig(cfg) && state.winnerId && (
              <>
                {" "}
                Decision: <strong>{data.entries.find((e) => e.id === state.winnerId)?.code}</strong>
                .
              </>
            )}
          </p>
        </div>
        {mode === "judge" && data.rfdDeadline && (
          <p className="text-xs text-fg-muted">
            You can still edit your RFD until{" "}
            {new Date(data.rfdDeadline).toLocaleString([], {
              weekday: "short",
              hour: "numeric",
              minute: "2-digit",
            })}
            .
          </p>
        )}
      </div>
    );
  }

  const errors = [...validation.errors, ...serverFindings.filter((f) => f.severity === "error")];
  const warnings = validation.warnings;
  const complete = isComplete(data, state);

  if (step === "review") {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
          <h2 className="text-lg font-semibold">Review your ballot</h2>
          <p className="text-sm text-fg-muted">
            Check everything before submitting — you won&apos;t be able to change the decision
            afterwards.
          </p>
          {isDebateConfig(cfg) ? (
            <dl className="mt-4 space-y-3">
              <div className="flex items-center justify-between rounded-xl bg-brand-soft p-3">
                <dt className="text-sm text-brand-soft-fg">Winner</dt>
                <dd className="flex items-center gap-2 font-semibold">
                  <Trophy className="size-4 text-brand" aria-hidden />
                  {data.entries.find((e) => e.id === state.winnerId)?.code} (
                  {sideLabel(data.entries.find((e) => e.id === state.winnerId)?.side ?? null)})
                </dd>
              </div>
              {ordered.map((e) => (
                <div key={e.id} className="rounded-xl border border-border p-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span>
                      {sideLabel(e.side)} · {e.code}
                    </span>
                    <span className="tabular">{validation.totals[e.id] ?? 0}</span>
                  </div>
                  <ul className="mt-1 space-y-0.5 text-sm text-fg-muted">
                    {(input.scores ?? [])
                      .filter((s) => s.entryId === e.id)
                      .map((s) => (
                        <li
                          key={`${s.competitorId}-${s.position}-${s.reply}`}
                          className="flex justify-between"
                        >
                          <span>
                            {s.reply ? "Reply · " : ""}
                            {e.competitors.find((c) => c.id === s.competitorId)?.name}
                            {s.rank ? ` · rank ${s.rank}` : ""}
                          </span>
                          <span className="tabular">{s.points}</span>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm">
              {Object.values(state.congress.ranks).filter((r) => r != null).length} legislators
              ranked · {Object.values(state.congress.speeches).reduce((a, s) => a + s.length, 0)}{" "}
              speeches scored
            </p>
          )}
          {warnings.map((w, i) => (
            <Alert key={i} tone="warning" icon={AlertTriangle} title={w.message} className="mt-3">
              {w.hint}
            </Alert>
          ))}
          {!state.rfd.trim() && mode === "judge" && (
            <Alert tone="neutral" title="No RFD yet" className="mt-3">
              That&apos;s OK — submit your decision now and finish the RFD later from this page.
            </Alert>
          )}
        </div>
        {error && <Alert tone="danger" icon={AlertOctagon} title={error} />}
        <div className="sticky bottom-3 z-10 flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep("edit")}>
            <ArrowLeft /> Edit
          </Button>
          <Button size="lg" className="flex-[2]" onClick={submit} loading={submitting}>
            <Send /> {queued ? "Waiting for connection…" : "Submit ballot"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {restored && <Alert tone="brand" title="Restored your unsent ballot from this device." />}
      <div className="flex items-center justify-between text-xs text-fg-subtle" aria-live="polite">
        <span className="inline-flex items-center gap-1">
          {online ? <Wifi className="size-3.5" /> : <CloudOff className="size-3.5 text-warning" />}
          {online
            ? savedAt
              ? `Saved ${savedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "Autosaving on this device"
            : "Offline — your work is saved on this device"}
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-fg"
          onClick={() => setState(initialState(data))}
        >
          <RotateCcw className="size-3" /> Reset
        </button>
      </div>

      {isDebateConfig(cfg) ? (
        <>
          {data.sidesPending && (
            <section
              className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-soft"
              aria-labelledby="flip"
            >
              <h2 id="flip" className="font-semibold">
                Sides after the coin flip
              </h2>
              {data.entries.map((e, i) => (
                <div key={e.id} className="flex items-center justify-between gap-3">
                  <span className="font-medium">{e.code}</span>
                  <div
                    className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1"
                    role="radiogroup"
                    aria-label={`${e.code} side`}
                  >
                    {(["A", "B"] as const).map((side) => {
                      const active = state.sides?.[e.id] === side;
                      return (
                        <button
                          key={side}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => {
                            const other = data.entries[1 - i];
                            setState((st) => ({
                              ...st,
                              sides: {
                                ...st.sides,
                                [e.id]: side,
                                ...(other ? { [other.id]: side === "A" ? "B" : "A" } : {}),
                              },
                            }));
                          }}
                          className={cn(
                            "h-9 rounded-lg px-4 text-sm font-medium transition",
                            active
                              ? side === "A"
                                ? "bg-aff text-white"
                                : "bg-neg text-white"
                              : "text-fg-muted",
                          )}
                        >
                          {cfg.sideLabels[side === "A" ? 0 : 1]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}
          {ordered.map((e) => (
            <TeamCard
              key={e.id}
              entry={e}
              cfg={cfg}
              sideLabel={sideLabel(e.side)}
              sidesPending={data.sidesPending && !e.side}
              team={state.teams[e.id]!}
              total={validation.totals[e.id] ?? 0}
              onChange={(team) => setState((s) => ({ ...s, teams: { ...s.teams, [e.id]: team } }))}
            />
          ))}
          <section
            className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-soft"
            aria-labelledby="decision"
          >
            <h2 id="decision" className="font-semibold">
              Decision
            </h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="decision">
              {ordered.map((e) => {
                const selected = state.winnerId === e.id;
                return (
                  <button
                    type="button"
                    key={e.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setState((s) => ({ ...s, winnerId: e.id }))}
                    className={cn(
                      "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-3 py-2 text-center transition",
                      selected
                        ? e.side === "B"
                          ? "border-neg bg-neg-soft"
                          : "border-aff bg-aff-soft"
                        : "border-border hover:border-border-strong",
                    )}
                  >
                    <span className="text-xs font-medium text-fg-muted">
                      {e.side ? `${sideLabel(e.side)} wins` : "Winner"}
                    </span>
                    <span className="font-semibold">{e.code}</span>
                    {selected && <Check className="mt-0.5 size-4" aria-hidden />}
                  </button>
                );
              })}
            </div>
            {warnings.map((w, i) => (
              <p
                key={i}
                className="flex items-start gap-1.5 text-sm text-[color-mix(in_oklch,var(--warning)_70%,var(--fg))]"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> {w.message}
              </p>
            ))}
          </section>
        </>
      ) : (
        <CongressScorer data={data} cfg={cfg as CongressConfig} state={state} setState={setState} />
      )}

      <section className="space-y-2 rounded-2xl border border-border bg-surface p-4 shadow-soft">
        <label htmlFor="rfd" className="font-semibold">
          Reason for decision
        </label>
        <Textarea
          id="rfd"
          value={state.rfd}
          onChange={(e) => setState((s) => ({ ...s, rfd: e.target.value }))}
          rows={5}
          placeholder="Explain your decision — what did it come down to?"
        />
        {mode === "judge" && isDebateConfig(cfg) && (
          <p className="text-xs text-fg-muted">
            Short on time? Submit your decision now and finish this within{" "}
            {cfg.ballot.rfdGraceHours} hours.
          </p>
        )}
        {isDebateConfig(cfg) && (
          <details className="pt-1">
            <summary className="cursor-pointer text-sm text-fg-muted">
              Comments for each team (optional)
            </summary>
            <div className="mt-2 space-y-2">
              {ordered.map((e) => (
                <div key={e.id}>
                  <label htmlFor={`c-${e.id}`} className="text-xs font-medium text-fg-muted">
                    For {e.code}
                  </label>
                  <Textarea
                    id={`c-${e.id}`}
                    rows={3}
                    value={state.comments[e.id] ?? ""}
                    onChange={(ev) =>
                      setState((s) => ({
                        ...s,
                        comments: { ...s.comments, [e.id]: ev.target.value },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {errors.length > 0 && complete && (
        <Alert tone="danger" icon={AlertOctagon} title="Fix these before submitting">
          <ul className="list-disc pl-4">
            {[...new Set(errors.map((e) => e.message))].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </Alert>
      )}
      {error && <Alert tone="danger" icon={AlertOctagon} title={error} />}

      <div className="sticky bottom-3 z-10">
        <Button
          size="lg"
          className="w-full shadow-lift"
          disabled={!complete || errors.length > 0}
          onClick={() => setStep("review")}
        >
          {complete
            ? "Review & submit"
            : isDebateConfig(cfg)
              ? "Enter all points and pick a winner"
              : "Rank at least one legislator"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TeamCard({
  entry,
  cfg,
  sideLabel,
  sidesPending,
  team,
  total,
  onChange,
}: {
  entry: BallotFormData["entries"][number];
  cfg: DebateConfig;
  sideLabel: string;
  sidesPending: boolean;
  team: TeamState;
  total: number;
  onChange: (t: TeamState) => void;
}) {
  const isWs = cfg.format === "world_schools";
  const ranks = cfg.ballot.speakerRanks;
  const setSpeaker = (i: number, patch: Partial<SpeakerSlot>) =>
    onChange({
      ...team,
      speakers: team.speakers.map((s, k) => (k === i ? { ...s, ...patch } : s)),
    });
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border bg-surface shadow-soft",
        entry.side === "B" ? "border-neg/40" : "border-aff/40",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between px-4 py-3",
          entry.side === "B" ? "bg-neg-soft" : "bg-aff-soft",
        )}
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            {sidesPending ? "Flip for sides" : sideLabel}
          </div>
          <div className="font-semibold">{entry.code}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-fg-muted">Total</div>
          <div className="text-lg font-semibold tabular">{total || "—"}</div>
        </div>
      </header>
      <div className="divide-y divide-border">
        {team.speakers.map((sp, i) => (
          <div key={i} className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              {entry.competitors.length > cfg.speakersPerTeam || isWs ? (
                <NativeSelect
                  aria-label={`Speaker ${i + 1}`}
                  value={sp.competitorId}
                  onChange={(e) => setSpeaker(i, { competitorId: e.target.value })}
                  className="h-9 max-w-56"
                >
                  {entry.competitors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
              ) : (
                <span className="font-medium">
                  {entry.competitors.find((c) => c.id === sp.competitorId)?.name ??
                    `Speaker ${i + 1}`}
                </span>
              )}
              <span className="text-xs text-fg-subtle">
                {isWs ? `Speaker ${i + 1}` : cfg.speakersPerTeam > 1 ? `Speaker ${i + 1}` : ""}
              </span>
            </div>
            {isWs ? (
              <ComponentInputs
                cfg={cfg as WorldSchoolsConfig}
                value={sp.components}
                onChange={(components) => setSpeaker(i, { components })}
                factor={1}
                label={`Speaker ${i + 1}`}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <PointsStepper
                  value={sp.points}
                  min={cfg.ballot.points.min}
                  max={cfg.ballot.points.max}
                  step={cfg.ballot.points.step}
                  onChange={(points) => setSpeaker(i, { points })}
                  label={`Points for speaker ${i + 1}`}
                />
                {ranks && (
                  <NativeSelect
                    aria-label={`Rank for speaker ${i + 1}`}
                    value={sp.rank ?? ""}
                    onChange={(e) =>
                      setSpeaker(i, { rank: e.target.value ? Number(e.target.value) : null })
                    }
                    className="h-11 w-24"
                  >
                    <option value="">Rank</option>
                    {Array.from({ length: cfg.speakersPerTeam * 2 }, (_, k) => (
                      <option key={k + 1} value={k + 1}>
                        {k + 1}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </div>
            )}
          </div>
        ))}
        {isWs && team.reply && (
          <div className="space-y-2 bg-surface-2/60 p-4">
            <div className="flex items-center justify-between gap-2">
              <NativeSelect
                aria-label="Reply speaker"
                value={team.reply.competitorId}
                onChange={(e) =>
                  onChange({ ...team, reply: { ...team.reply!, competitorId: e.target.value } })
                }
                className="h-9 max-w-56"
              >
                {team.speakers.slice(0, 2).map((s) => (
                  <option key={s.competitorId} value={s.competitorId}>
                    {entry.competitors.find((c) => c.id === s.competitorId)?.name}
                  </option>
                ))}
              </NativeSelect>
              <span className="text-xs text-fg-subtle">Reply speech</span>
            </div>
            <ComponentInputs
              cfg={cfg as WorldSchoolsConfig}
              value={team.reply.components}
              onChange={(components) =>
                onChange({ ...team, reply: { ...team.reply!, components } })
              }
              factor={0.5}
              label="Reply"
            />
          </div>
        )}
      </div>
    </section>
  );
}

function PointsStepper({
  value,
  min,
  max,
  step,
  onChange,
  label,
}: {
  value: number | null;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  useEffect(() => setText(value?.toString() ?? ""), [value]);
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)) / step) * step;
  const bump = (d: number) => onChange(round2(clamp((value ?? (min + max) / 2) + d)));
  const out = value != null && (value < min || value > max);
  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-xl"
        onClick={() => bump(-step)}
        aria-label={`Decrease ${label}`}
      >
        <Minus />
      </Button>
      <input
        inputMode="decimal"
        aria-label={label}
        value={text}
        placeholder={`${min}–${max}`}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
        className={cn(
          "h-11 w-24 rounded-xl border bg-surface text-center text-lg font-semibold tabular outline-none focus:border-brand focus:ring-4 focus:ring-ring/40",
          out ? "border-danger" : "border-border",
        )}
      />
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="size-11 rounded-xl"
        onClick={() => bump(step)}
        aria-label={`Increase ${label}`}
      >
        <Plus />
      </Button>
    </div>
  );
}

function ComponentInputs({
  cfg,
  value,
  onChange,
  factor,
  label,
}: {
  cfg: WorldSchoolsConfig;
  value: Components | null;
  onChange: (v: Components) => void;
  factor: number;
  label: string;
}) {
  const s = cfg.scoring;
  const v = value ?? {
    style: round2(((s.style.min + s.style.max) / 2) * factor),
    content: round2(((s.content.min + s.content.max) / 2) * factor),
    strategy: round2(((s.strategy.min + s.strategy.max) / 2) * factor),
  };
  const parts: [keyof Components, string, { min: number; max: number }][] = [
    ["style", "Style", s.style],
    ["content", "Content", s.content],
    ["strategy", "Strategy", s.strategy],
  ];
  const step = s.step * factor;
  return (
    <div className="grid grid-cols-3 gap-2">
      {parts.map(([key, name, range]) => (
        <label key={key} className="grid gap-1 text-center">
          <span className="text-[11px] font-medium text-fg-muted">
            {name}{" "}
            <span className="text-fg-subtle">
              {range.min * factor}–{range.max * factor}
            </span>
          </span>
          <input
            type="number"
            inputMode="decimal"
            aria-label={`${label} ${name}`}
            min={range.min * factor}
            max={range.max * factor}
            step={step}
            value={value ? v[key] : ""}
            placeholder={String(v[key])}
            onChange={(e) => onChange({ ...v, [key]: Number(e.target.value) })}
            className="h-11 rounded-xl border border-border bg-surface text-center text-base font-semibold tabular outline-none focus:border-brand focus:ring-4 focus:ring-ring/40"
          />
        </label>
      ))}
      <div className="col-span-3 text-right text-xs text-fg-muted">
        Total{" "}
        <span className="font-semibold tabular text-fg">
          {value ? round2(v.style + v.content + v.strategy) : "—"}
        </span>
      </div>
    </div>
  );
}

function CongressScorer({
  data,
  cfg,
  state,
  setState,
}: {
  data: BallotFormData;
  cfg: CongressConfig;
  state: FormState;
  setState: React.Dispatch<React.SetStateAction<FormState>>;
}) {
  const maxRank = Math.min(cfg.ranksPerBallot, data.entries.length);
  const used = new Set(Object.values(state.congress.ranks).filter((r): r is number => r != null));
  const pts = Array.from(
    { length: cfg.speechPoints.max - cfg.speechPoints.min + 1 },
    (_, i) => cfg.speechPoints.min + i,
  );
  const setSpeeches = (id: string, list: number[]) =>
    setState((s) => ({
      ...s,
      congress: { ...s.congress, speeches: { ...s.congress.speeches, [id]: list } },
    }));
  const setRank = (id: string, rank: number | null) =>
    setState((s) => {
      const ranks = { ...s.congress.ranks };
      if (rank != null) for (const k of Object.keys(ranks)) if (ranks[k] === rank) ranks[k] = null;
      ranks[id] = rank;
      return { ...s, congress: { ...s.congress, ranks } };
    });
  return (
    <div className="space-y-3">
      <Alert tone="brand" title="How to score">
        Add a score ({cfg.speechPoints.min}–{cfg.speechPoints.max}) for each speech, then rank your
        top {maxRank} legislators. Picking a rank that&apos;s already used moves it.
      </Alert>
      <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
        {data.entries.map((e) => {
          const list = state.congress.speeches[e.id] ?? [];
          const rank = state.congress.ranks[e.id];
          return (
            <li key={e.id} className="space-y-2 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {e.code}
                  {state.congress.poEntryId === e.id && (
                    <Badge tone="brand" className="ml-2">
                      <Crown /> PO
                    </Badge>
                  )}
                </span>
                <NativeSelect
                  aria-label={`Rank for ${e.code}`}
                  value={rank ?? ""}
                  onChange={(ev) => setRank(e.id, ev.target.value ? Number(ev.target.value) : null)}
                  className={cn("h-9 w-24", rank != null && "border-brand font-semibold")}
                >
                  <option value="">Rank</option>
                  {Array.from({ length: maxRank }, (_, k) => (
                    <option key={k + 1} value={k + 1}>
                      {k + 1}
                      {used.has(k + 1) && rank !== k + 1 ? " (used)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {list.map((p, k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      setSpeeches(
                        e.id,
                        list.filter((_, j) => j !== k),
                      )
                    }
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-brand-soft px-2.5 text-sm font-semibold text-brand-soft-fg"
                    aria-label={`Remove speech score ${p}`}
                  >
                    {p} <span aria-hidden>×</span>
                  </button>
                ))}
                <span className="text-xs text-fg-subtle">Add speech:</span>
                {pts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setSpeeches(e.id, [...list, p])}
                    className="size-8 rounded-lg border border-border text-sm font-medium hover:border-brand hover:bg-brand-soft"
                    aria-label={`Add speech scored ${p} for ${e.code}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {cfg.presidingOfficer.enabled && (
        <section className="grid gap-2 rounded-2xl border border-border bg-surface p-4 shadow-soft sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Presiding officer</span>
            <NativeSelect
              value={state.congress.poEntryId ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  congress: { ...s.congress, poEntryId: e.target.value || null },
                }))
              }
            >
              <option value="">None this session</option>
              {data.entries.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.code}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium">PO points</span>
            <NativeSelect
              value={state.congress.poPoints ?? ""}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  congress: {
                    ...s.congress,
                    poPoints: e.target.value ? Number(e.target.value) : null,
                  },
                }))
              }
            >
              <option value="">—</option>
              {Array.from({ length: cfg.presidingOfficer.pointsMax }, (_, k) => (
                <option key={k + 1} value={k + 1}>
                  {k + 1}
                </option>
              ))}
            </NativeSelect>
          </label>
        </section>
      )}
    </div>
  );
}
