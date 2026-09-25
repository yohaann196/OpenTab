"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  ChevronDown,
  GripVertical,
  Save,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import { savePrefsViaLink } from "@/app/p/actions";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { Alert, Progress } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type Judge = { id: string; name: string; roundsOwed: number; paradigm: string | null };
type Pref = { judgeId: string; ordinal: number | null; tier: number | null; strike: boolean };

export function PrefSheet({
  token,
  mode,
  strikesAllowed,
  tiers,
  judges,
  initial,
  submittedAt,
}: {
  token: string;
  mode: "ordinal" | "tiers" | "none";
  strikesAllowed: number;
  tiers: { name: string; minPct: number; maxPct: number }[];
  judges: Judge[];
  initial: Pref[];
  submittedAt: string | null;
}) {
  const byId = useMemo(() => new Map(judges.map((j) => [j.id, j])), [judges]);
  const [order, setOrder] = useState<string[]>(() => {
    const ranked = initial
      .filter((p) => p.ordinal != null && !p.strike)
      .sort((a, b) => a.ordinal! - b.ordinal!)
      .map((p) => p.judgeId);
    const rest = judges.map((j) => j.id).filter((id) => !ranked.includes(id));
    return [...ranked, ...rest].filter((id) => byId.has(id));
  });
  const [tierOf, setTierOf] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(initial.map((p) => [p.judgeId, p.tier])),
  );
  const [struck, setStruck] = useState<Set<string>>(
    () => new Set(initial.filter((p) => p.strike).map((p) => p.judgeId)),
  );
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const { exec, pending, findings } = useAction();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const totalRounds = judges.reduce((a, j) => a + Math.max(1, j.roundsOwed), 0);
  const tierUsage = tiers.map((_, i) => {
    const used = judges
      .filter((j) => !struck.has(j.id) && tierOf[j.id] === i + 1)
      .reduce((a, j) => a + Math.max(1, j.roundsOwed), 0);
    return totalRounds ? (used / totalRounds) * 100 : 0;
  });

  const build = () =>
    mode === "ordinal"
      ? order.map((id, i) => ({
          judgeId: id,
          ordinal: struck.has(id) ? null : i + 1,
          tier: null,
          strike: struck.has(id),
        }))
      : judges.map((j) => ({
          judgeId: j.id,
          ordinal: null,
          tier: tierOf[j.id] ?? null,
          strike: struck.has(j.id),
        }));

  const move = (id: string, delta: number) =>
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = Math.max(0, Math.min(o.length - 1, i + delta));
      const next = [...o];
      next.splice(i, 1);
      next.splice(j, 0, id);
      return next;
    });
  const onDragEnd = (e: DragEndEvent) => {
    const from = String(e.active.id);
    const to = e.over ? String(e.over.id).replace("slot:", "") : null;
    if (!to || from === to) return;
    setOrder((o) => {
      const next = o.filter((x) => x !== from);
      next.splice(next.indexOf(to) + (o.indexOf(from) < o.indexOf(to) ? 1 : 0), 0, from);
      return next;
    });
  };
  const toggleStrike = (id: string) =>
    setStruck((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const visible = (mode === "ordinal" ? order : judges.map((j) => j.id)).filter((id) =>
    matches(q, byId.get(id)?.name, byId.get(id)?.paradigm),
  );

  return (
    <div className="space-y-4">
      {submittedAt && (
        <Alert
          tone="success"
          icon={CheckCircle2}
          title={`Submitted ${new Date(submittedAt).toLocaleString()}`}
        >
          You can keep editing until the tab room starts placing judges.
        </Alert>
      )}
      <div className="sticky top-14 z-20 space-y-3 rounded-2xl border border-border bg-surface/95 p-3 shadow-soft backdrop-blur">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={struck.size > strikesAllowed ? "danger" : "neutral"}>
            <Ban /> {struck.size}/{strikesAllowed} strikes
          </Badge>
          {mode === "tiers" &&
            tiers.map((t, i) => {
              const pct = tierUsage[i]!;
              const ok = pct >= t.minPct - 0.01 && pct <= t.maxPct + 0.01;
              return (
                <Badge key={t.name} tone={ok ? "success" : "warning"}>
                  Tier {t.name}: {pct.toFixed(0)}% ({t.minPct}–{t.maxPct}%)
                </Badge>
              );
            })}
        </div>
        {mode === "tiers" && <Progress value={tierUsage.reduce((a, b) => a + b, 0)} />}
        <SearchInput value={q} onChange={setQ} placeholder="Search judges or paradigms" />
      </div>

      <DndContext
        id="prefs"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <ol className="space-y-1.5">
          {visible.map((id) => {
            const j = byId.get(id)!;
            const rank =
              mode === "ordinal" && !struck.has(id)
                ? order.filter((x) => !struck.has(x)).indexOf(id) + 1
                : null;
            return (
              <PrefRow key={id} id={id} draggable={mode === "ordinal" && !q}>
                <div
                  className={cn(
                    "rounded-xl border border-border bg-surface shadow-soft",
                    struck.has(id) && "opacity-60",
                  )}
                >
                  <div className="flex items-center gap-2 px-3 py-2">
                    {mode === "ordinal" && (
                      <GripVertical className="size-4 shrink-0 text-fg-subtle" aria-hidden />
                    )}
                    {rank != null && (
                      <span className="w-7 shrink-0 text-right text-sm font-semibold tabular text-brand">
                        {rank}
                      </span>
                    )}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setExpanded(expanded === id ? null : id)}
                      aria-expanded={expanded === id}
                    >
                      <span
                        className={cn(
                          "block truncate font-medium",
                          struck.has(id) && "line-through",
                        )}
                      >
                        {j.name}
                      </span>
                      <span className="block text-xs text-fg-muted">
                        {j.roundsOwed || "?"} rounds {j.paradigm ? "· paradigm" : ""}
                        <ChevronDown
                          className={cn(
                            "ml-1 inline size-3 transition",
                            expanded === id && "rotate-180",
                          )}
                        />
                      </span>
                    </button>
                    {mode === "tiers" && !struck.has(id) && (
                      <NativeSelect
                        aria-label={`Tier for ${j.name}`}
                        value={tierOf[id] ?? ""}
                        onChange={(e) =>
                          setTierOf((t) => ({
                            ...t,
                            [id]: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        className="h-9 w-24"
                      >
                        <option value="">Tier</option>
                        {tiers.map((t, i) => (
                          <option key={t.name} value={i + 1}>
                            {t.name}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                    {mode === "ordinal" && !struck.has(id) && (
                      <span className="flex">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${j.name} up`}
                          onClick={() => move(id, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Move ${j.name} down`}
                          onClick={() => move(id, 1)}
                        >
                          <ArrowDown />
                        </Button>
                      </span>
                    )}
                    {strikesAllowed > 0 && (
                      <Button
                        variant={struck.has(id) ? "danger" : "ghost"}
                        size="icon-sm"
                        aria-pressed={struck.has(id)}
                        aria-label={`${struck.has(id) ? "Unstrike" : "Strike"} ${j.name}`}
                        onClick={() => toggleStrike(id)}
                      >
                        <Ban />
                      </Button>
                    )}
                  </div>
                  {expanded === id && (
                    <p className="whitespace-pre-wrap border-t border-border px-4 py-3 text-sm text-fg-muted">
                      {j.paradigm ?? "No paradigm provided."}
                    </p>
                  )}
                </div>
              </PrefRow>
            );
          })}
        </ol>
      </DndContext>

      {findings.length > 0 && (
        <Alert tone="danger" title="Please fix these">
          <ul className="list-disc pl-4">
            {findings.map((f, i) => (
              <li key={i}>{f.message}</li>
            ))}
          </ul>
        </Alert>
      )}
      <div className="sticky bottom-3 z-10 flex gap-2">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          loading={pending}
          onClick={() => exec(() => savePrefsViaLink(token, { prefs: build(), submit: false }))}
        >
          <Save /> Save draft
        </Button>
        <Button
          size="lg"
          className="flex-[2]"
          loading={pending}
          onClick={() => exec(() => savePrefsViaLink(token, { prefs: build(), submit: true }))}
        >
          <Send /> Submit prefs
        </Button>
      </div>
    </div>
  );
}

function PrefRow({
  id,
  draggable,
  children,
}: {
  id: string;
  draggable: boolean;
  children: React.ReactNode;
}) {
  const drag = useDraggable({ id, disabled: !draggable });
  const drop = useDroppable({ id: `slot:${id}` });
  return (
    <li
      ref={(n) => {
        drag.setNodeRef(n);
        drop.setNodeRef(n);
      }}
      {...(draggable ? { ...drag.listeners, ...drag.attributes } : {})}
      className={cn(
        drop.isOver && "rounded-xl ring-2 ring-brand/50",
        drag.isDragging && "opacity-50",
      )}
      style={
        drag.transform
          ? {
              transform: `translate3d(0, ${drag.transform.y}px, 0)`,
              position: "relative",
              zIndex: 20,
            }
          : undefined
      }
    >
      {children}
    </li>
  );
}
