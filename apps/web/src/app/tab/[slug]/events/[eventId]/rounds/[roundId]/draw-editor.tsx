"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DrawEditorData, EditOp } from "@opentab/core";
import { type Finding, TERM_LABELS } from "@opentab/engine";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeftRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCheck,
  Crown,
  DoorOpen,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Info,
  Lock,
  Megaphone,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Send,
  Shuffle,
  Undo2,
  Unlock,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  allocateJudgesAction,
  allocateRoomsAction,
  applyEditAction,
  generateDraftAction,
  publishRoundAction,
  releaseMotionAction,
  republishRoundAction,
  revertRoundAction,
  setBallotsReleasedAction,
  setRoundCompletedAction,
  unpublishRoundAction,
} from "@/app/tab/actions";
import { LiveRefresh } from "@/components/live/live-refresh";
import { ConfirmButton } from "@/components/tab/confirm-button";
import { matches, SearchInput } from "@/components/tab/search-input";
import { Badge, SideBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Input, NativeSelect } from "@/components/ui/input";
import { Alert, EmptyState } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { useAction } from "@/lib/use-action";
import { cn, timeAgo } from "@/lib/utils";

type Debate = DrawEditorData["debates"][number];

export function DrawEditor({
  slug,
  tournamentId,
  data,
  canEdit,
}: {
  slug: string;
  tournamentId: string;
  data: DrawEditorData;
  canEdit: boolean;
}) {
  const { round, debates, entries, judges, rooms, findings, sideLabels, event } = data;
  const router = useRouter();
  const params = useSearchParams();
  const { exec, pending } = useAction();
  const [q, setQ] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<{ pairingId: string; entryId: string } | null>(
    null,
  );
  const [selectedJudge, setSelectedJudge] = useState<string | null>(null);
  const [dragLabel, setDragLabel] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const isCongress = event.format === "congress";
  const isDraft = round.status === "draft";
  const judgeById = useMemo(() => new Map(judges.map((j) => [j.id, j])), [judges]);
  const roomById = useMemo(() => new Map(rooms.map((r) => [r.id, r])), [rooms]);
  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warning");
  const outdatedPublic =
    round.status !== "draft" &&
    round.publishedVersion !== null &&
    round.version > round.publishedVersion;

  useEffect(() => {
    if (params.get("generated")) {
      toast.success(`${round.label} paired`, {
        description: `${debates.filter((d) => !d.bye).length} ${isCongress ? "chambers" : "debates"}${errors.length ? ` · ${errors.length} issue(s) to fix` : " · no blocking issues"}`,
      });
      router.replace(`/tab/${slug}/events/${event.id}/rounds/${round.id}`, { scroll: false });
    }
  }, [params, router, slug, event.id, round.id, round.label, debates, errors.length, isCongress]);

  const edit = (op: EditOp, success?: string) =>
    exec(() => applyEditAction(slug, round.id, op), { success, quiet: !success });

  const findingsFor = (d: Debate): Finding[] =>
    findings.filter(
      (f) =>
        f.pairingKeys?.includes(d.id) ||
        (f.entryIds?.some((id) => d.entries.some((e) => e.entryId === id)) &&
          f.code !== "bye" &&
          f.code !== "pullup") ||
        (f.judgeIds?.some((id) => d.judges.some((j) => j.judgeId === id)) &&
          f.code !== "judge_busy"),
    );

  const visible = debates.filter((d) =>
    matches(
      q,
      d.label,
      roomById.get(d.roomId ?? "")?.name,
      ...d.entries.map((e) => entries[e.entryId]?.code),
      ...d.judges.map((j) => judgeById.get(j.judgeId)?.name),
    ),
  );

  // ---- drag & drop --------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const onDragStart = (e: DragStartEvent) =>
    setDragLabel(String(e.active.data.current?.label ?? ""));
  const onDragEnd = (e: DragEndEvent) => {
    setDragLabel(null);
    const a = e.active.data.current as
      | { kind: string; pairingId: string | null; id: string }
      | undefined;
    const o = e.over?.data.current as
      | { kind: string; pairingId: string | null; id?: string }
      | undefined;
    if (!a || !o || !canEdit) return;
    if (
      a.kind === "entry" &&
      o.kind === "entry" &&
      a.pairingId &&
      o.pairingId &&
      o.id &&
      !(a.pairingId === o.pairingId && a.id === o.id)
    ) {
      void edit(
        {
          type: "swapEntries",
          a: { pairingId: a.pairingId, entryId: a.id },
          b: { pairingId: o.pairingId, entryId: o.id },
        },
        "Swapped",
      );
    } else if (
      a.kind === "entry" &&
      o.kind === "debate" &&
      o.pairingId &&
      a.pairingId !== o.pairingId
    ) {
      void edit({ type: "moveEntry", entryId: a.id, toPairingId: o.pairingId }, "Moved");
    } else if (
      a.kind === "judge" &&
      o.kind === "debate" &&
      o.pairingId &&
      a.pairingId !== o.pairingId
    ) {
      void edit(
        {
          type: "setJudge",
          pairingId: o.pairingId,
          judgeId: a.id,
          role: isCongress ? "scorer" : "panelist",
        },
        "Judge placed",
      );
    } else if (a.kind === "judge" && o.kind === "pool" && a.pairingId) {
      void edit({ type: "removeJudge", pairingId: a.pairingId, judgeId: a.id }, "Judge removed");
    }
  };

  const clickEntry = (pairingId: string, entryId: string) => {
    if (!canEdit) return;
    if (!selectedEntry) return setSelectedEntry({ pairingId, entryId });
    if (selectedEntry.entryId === entryId) return setSelectedEntry(null);
    void edit({ type: "swapEntries", a: selectedEntry, b: { pairingId, entryId } }, "Swapped");
    setSelectedEntry(null);
  };

  const unplaced = judges.filter((j) => !j.placed);

  return (
    <DndContext id="draw-editor" sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="space-y-5">
        {/* Header / actions */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-4 shadow-soft lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{round.label}</h2>
              <Badge
                tone={
                  round.status === "published"
                    ? "success"
                    : round.status === "completed"
                      ? "brand"
                      : "neutral"
                }
              >
                {round.status}
              </Badge>
              <span className="text-xs text-fg-subtle">v{round.version}</span>
              {round.scheduledPublishAt && isDraft && (
                <Badge tone="warning">
                  <CalendarClock /> publishes{" "}
                  {new Date(round.scheduledPublishAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </Badge>
              )}
              <LiveRefresh
                slug={slug}
                types={["round.updated", "ballot.updated", "round.published", "round.unpublished"]}
                className="ml-1"
              />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg-muted">
              <span>
                {debates.filter((d) => !d.bye).length} {isCongress ? "chambers" : "debates"}
              </span>
              {debates.some((d) => d.bye) && <span>{debates.filter((d) => d.bye).length} bye</span>}
              <span className={cn(errors.length ? "text-danger" : "text-success")}>
                {errors.length
                  ? `${errors.length} error${errors.length === 1 ? "" : "s"}`
                  : "No blocking issues"}
              </span>
              {warnings.length > 0 && (
                <span className="text-[color-mix(in_oklch,var(--warning)_70%,var(--fg))]">
                  {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                </span>
              )}
              {round.motion && (
                <span className="inline-flex items-center gap-1">
                  {round.motionReleased ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}{" "}
                  motion {round.motionReleased ? "released" : "hidden"}
                </span>
              )}
            </div>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-2">
              {isDraft ? (
                <>
                  <ConfirmButton
                    variant="secondary"
                    size="sm"
                    title="Re-pair this round?"
                    description="Unlocked debates will be regenerated from scratch (locked debates are kept). You can undo from History."
                    confirmLabel="Re-pair"
                    onConfirm={() =>
                      exec(() => generateDraftAction(slug, round.id), {
                        success: "Round re-paired",
                      })
                    }
                  >
                    <Shuffle /> {debates.length ? "Re-pair" : "Pair"}
                  </ConfirmButton>
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={pending}
                    onClick={() => exec(() => allocateJudgesAction(slug, round.id))}
                  >
                    <Users /> Place judges
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => exec(() => allocateRoomsAction(slug, round.id))}
                  >
                    <DoorOpen /> Place rooms
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setPublishOpen(true)}
                    disabled={debates.length === 0}
                  >
                    <Send /> Publish
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild size="sm">
                    <Link href={`/tab/${slug}/events/${event.id}/rounds/${round.id}/ballots`}>
                      <ClipboardCheck /> Ballots
                    </Link>
                  </Button>
                  {outdatedPublic && (
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={() => exec(() => republishRoundAction(slug, round.id))}
                    >
                      <RefreshCw /> Update public pairings
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="secondary" size="sm">
                        More <ChevronDown />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {round.motion && !round.motionReleased && (
                        <DropdownMenuItem
                          onSelect={() => exec(() => releaseMotionAction(slug, round.id))}
                        >
                          <Megaphone /> Release motion
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() =>
                          exec(() =>
                            setBallotsReleasedAction(slug, round.id, !round.ballotsReleased),
                          )
                        }
                      >
                        {round.ballotsReleased ? <EyeOff /> : <Eye />}{" "}
                        {round.ballotsReleased
                          ? "Hide ballots from entries"
                          : "Release ballots to entries"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          exec(() =>
                            setRoundCompletedAction(slug, round.id, round.status !== "completed"),
                          )
                        }
                      >
                        <CheckCircle2 />{" "}
                        {round.status === "completed" ? "Reopen round" : "Mark completed"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        destructive
                        onSelect={() => exec(() => unpublishRoundAction(slug, round.id))}
                      >
                        <Undo2 /> Unpublish
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          )}
        </div>

        {outdatedPublic && (
          <Alert
            tone="warning"
            icon={AlertTriangle}
            title="You've changed this round since it was published"
          >
            Competitors still see the published version. Click &ldquo;Update public pairings&rdquo;
            when you&apos;re ready.
          </Alert>
        )}

        <div className="grid gap-5 xl:grid-cols-[1fr_21rem]">
          {/* Debates */}
          <section className="min-w-0 space-y-3" aria-label="Draw">
            <div className="flex flex-wrap items-center gap-3">
              <SearchInput
                value={q}
                onChange={setQ}
                placeholder="Find an entry, judge or room"
                className="w-full sm:w-72"
              />
              {selectedEntry && (
                <Badge tone="brand">
                  <ArrowLeftRight /> Click another entry to swap with{" "}
                  {entries[selectedEntry.entryId]?.code}
                  <button
                    type="button"
                    onClick={() => setSelectedEntry(null)}
                    aria-label="Cancel swap"
                    className="ml-1"
                  >
                    <X />
                  </button>
                </Badge>
              )}
              {selectedJudge && (
                <Badge tone="brand">
                  <UserPlus /> Click &ldquo;Add judge&rdquo; on a debate to place{" "}
                  {judgeById.get(selectedJudge)?.name}
                  <button
                    type="button"
                    onClick={() => setSelectedJudge(null)}
                    aria-label="Cancel"
                    className="ml-1"
                  >
                    <X />
                  </button>
                </Badge>
              )}
              {canEdit && (
                <span className="text-xs text-fg-subtle">
                  Drag teams to swap, drag judges between debates.
                </span>
              )}
            </div>

            {debates.length === 0 ? (
              <EmptyState
                icon={Shuffle}
                title="Nothing paired yet"
                action={
                  canEdit && (
                    <Button
                      onClick={() =>
                        exec(() => generateDraftAction(slug, round.id), { success: "Round paired" })
                      }
                      loading={pending}
                    >
                      <Shuffle /> Pair this round
                    </Button>
                  )
                }
              >
                OpenTab will pair the round, place judges and rooms, and flag anything that needs
                your attention.
              </EmptyState>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-soft">
                <div className="hidden grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_9rem_4.5rem] gap-3 border-b border-border bg-surface-2 px-3 py-2 text-xs font-medium text-fg-muted md:grid">
                  <span>#</span>
                  <span>
                    {isCongress
                      ? "Chamber"
                      : sideLabels
                        ? `${sideLabels[0]} vs ${sideLabels[1]}`
                        : "Debate"}
                  </span>
                  <span>Judges</span>
                  <span>Room</span>
                  <span className="sr-only">Actions</span>
                </div>
                <ul className="divide-y divide-border">
                  {visible.map((d, i) => (
                    <DebateRow
                      key={d.id}
                      index={i + 1}
                      d={d}
                      data={data}
                      findings={findingsFor(d)}
                      canEdit={canEdit}
                      selectedEntry={selectedEntry}
                      onEntryClick={clickEntry}
                      selectedJudge={selectedJudge}
                      onPlaceSelected={() => {
                        if (!selectedJudge) return;
                        void edit(
                          {
                            type: "setJudge",
                            pairingId: d.id,
                            judgeId: selectedJudge,
                            role: isCongress ? "scorer" : "panelist",
                          },
                          "Judge placed",
                        );
                        setSelectedJudge(null);
                      }}
                      edit={edit}
                    />
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Sidebar */}
          <aside className="space-y-3" aria-label="Round tools">
            <Tabs defaultValue={findings.length ? "issues" : "judges"}>
              <TabsList className="w-full">
                <TabsTrigger value="issues" className="flex-1">
                  Issues
                  {errors.length + warnings.length > 0 && (
                    <span className="rounded-full bg-danger px-1.5 text-[10px] text-white">
                      {errors.length + warnings.length}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="judges" className="flex-1">
                  Judges{" "}
                  <span className="text-xs text-fg-subtle">
                    {unplaced.filter((j) => j.available && !j.trainee).length}
                  </span>
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1">
                  History
                </TabsTrigger>
              </TabsList>
              <TabsContent value="issues" className="mt-3">
                <IssuesPanel findings={findings} />
              </TabsContent>
              <TabsContent value="judges" className="mt-3">
                <JudgePool
                  judges={unplaced}
                  selected={selectedJudge}
                  onSelect={setSelectedJudge}
                  canEdit={canEdit}
                />
              </TabsContent>
              <TabsContent value="history" className="mt-3">
                <HistoryPanel
                  history={data.history}
                  canRevert={canEdit && isDraft}
                  onRevert={(id) =>
                    exec(() => revertRoundAction(slug, round.id, id, "before"), {
                      success: "Change undone",
                    })
                  }
                />
              </TabsContent>
            </Tabs>
          </aside>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragLabel && (
          <div className="rounded-md border border-brand bg-surface px-2.5 py-1.5 text-sm font-medium shadow-lift">
            {dragLabel}
          </div>
        )}
      </DragOverlay>

      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        errors={errors}
        warnings={warnings}
        onPublish={async (opts) => {
          const res = await exec(() => publishRoundAction(slug, round.id, opts));
          if (res.ok) setPublishOpen(false);
        }}
        pending={pending}
        tournamentId={tournamentId}
      />
    </DndContext>
  );
}

// ---------------------------------------------------------------------------

function DebateRow({
  index,
  d,
  data,
  findings,
  canEdit,
  selectedEntry,
  onEntryClick,
  selectedJudge,
  onPlaceSelected,
  edit,
}: {
  index: number;
  d: Debate;
  data: DrawEditorData;
  findings: Finding[];
  canEdit: boolean;
  selectedEntry: { pairingId: string; entryId: string } | null;
  onEntryClick: (pairingId: string, entryId: string) => void;
  selectedJudge: string | null;
  onPlaceSelected: () => void;
  edit: (op: EditOp, success?: string) => Promise<unknown>;
}) {
  const { entries, judges, rooms, sideLabels, event, round } = data;
  const isCongress = event.format === "congress";
  const { setNodeRef, isOver } = useDroppable({
    id: `debate:${d.id}`,
    data: { kind: "debate", pairingId: d.id },
  });
  const judgeById = new Map(judges.map((j) => [j.id, j]));
  const room = rooms.find((r) => r.id === d.roomId);
  const errs = findings.filter((f) => f.severity === "error");
  const warns = findings.filter((f) => f.severity === "warning");
  const flightRooms = rooms.filter((r) => r.available || r.id === d.roomId);

  return (
    <li
      ref={setNodeRef}
      id={`debate-${d.id}`}
      className={cn(
        "grid gap-3 px-3 py-3 transition-colors md:grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1.3fr)_9rem_4.5rem] md:items-center",
        isOver && "bg-brand-soft/60",
        d.locked && "bg-surface-2/60",
        errs.length > 0 && "shadow-[inset_3px_0_0_var(--danger)]",
        errs.length === 0 && warns.length > 0 && "shadow-[inset_3px_0_0_var(--warning)]",
      )}
    >
      <div className="flex items-center gap-2 text-xs text-fg-subtle md:flex-col md:items-start md:gap-0.5">
        <span className="font-mono tabular">{index}</span>
        {round.flights > 1 && (
          <span className="rounded bg-surface-3 px-1 text-[10px]">F{d.flight}</span>
        )}
        {d.bracket !== null && <span className="text-[10px]">{d.bracket}W</span>}
      </div>

      <div className="min-w-0">
        {d.label && <div className="mb-1 text-xs font-semibold text-fg-muted">{d.label}</div>}
        {d.bye ? (
          <div className="flex items-center gap-2">
            {d.entries.map((e) => (
              <EntryChip
                key={e.entryId}
                pairingId={d.id}
                entryId={e.entryId}
                data={data}
                canEdit={canEdit}
                selected={selectedEntry?.entryId === e.entryId}
                onClick={onEntryClick}
              />
            ))}
            <Badge>Bye</Badge>
          </div>
        ) : isCongress ? (
          <div className="flex flex-wrap gap-1">
            {d.entries.map((e) => (
              <EntryChip
                key={e.entryId}
                pairingId={d.id}
                entryId={e.entryId}
                data={data}
                canEdit={canEdit}
                selected={selectedEntry?.entryId === e.entryId}
                onClick={onEntryClick}
                compact
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-start gap-1">
            {d.entries.map((e) => (
              <span key={e.entryId} className="inline-flex max-w-full items-center gap-2">
                <span className="w-11 shrink-0">
                  <SideBadge side={e.side} labels={sideLabels} pending={d.sidesPending} />
                </span>
                <EntryChip
                  pairingId={d.id}
                  entryId={e.entryId}
                  data={data}
                  canEdit={canEdit}
                  selected={selectedEntry?.entryId === e.entryId}
                  onClick={onEntryClick}
                  pulledUp={e.pulledUp}
                />
              </span>
            ))}
            {d.forfeitEntryId && (
              <Badge tone="danger">forfeit: {entries[d.forfeitEntryId]?.code}</Badge>
            )}
          </div>
        )}
        {(errs.length > 0 || warns.length > 0) && (
          <ul className="mt-1.5 space-y-0.5">
            {[...errs, ...warns].slice(0, 3).map((f, i) => (
              <li
                key={i}
                className={cn(
                  "flex items-start gap-1 text-xs",
                  f.severity === "error"
                    ? "text-danger"
                    : "text-[color-mix(in_oklch,var(--warning)_70%,var(--fg))]",
                )}
              >
                {f.severity === "error" ? (
                  <AlertOctagon className="mt-px size-3 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-px size-3 shrink-0" />
                )}
                {f.message}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {!d.bye &&
          d.judges.map((j) => {
            const info = judgeById.get(j.judgeId);
            return (
              <JudgeChip
                key={j.judgeId}
                pairingId={d.id}
                judgeId={j.judgeId}
                name={info?.name ?? "Judge"}
                role={j.role}
                rating={info?.rating}
                canEdit={canEdit}
                onRemove={() =>
                  edit(
                    { type: "removeJudge", pairingId: d.id, judgeId: j.judgeId },
                    "Judge removed",
                  )
                }
                onChair={() =>
                  edit({
                    type: "setJudge",
                    pairingId: d.id,
                    judgeId: j.judgeId,
                    role: isCongress ? "parliamentarian" : "chair",
                  })
                }
              />
            );
          })}
        {!d.bye && canEdit && selectedJudge && (
          <Button variant="soft" size="sm" className="h-7 px-2 text-xs" onClick={onPlaceSelected}>
            <Plus /> Add judge
          </Button>
        )}
        {!d.bye && d.judges.length === 0 && !selectedJudge && (
          <span className="text-xs text-danger">No judge</span>
        )}
      </div>

      <div>
        {!d.bye && (
          <NativeSelect
            aria-label="Room"
            value={d.roomId ?? ""}
            disabled={!canEdit}
            onChange={(e) =>
              edit(
                { type: "setRoom", pairingId: d.id, roomId: e.target.value || null },
                "Room changed",
              )
            }
            className={cn("h-8 text-xs", !d.roomId && "border-danger/60 text-danger")}
          >
            <option value="">No room</option>
            {flightRooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.accessible ? " ♿" : ""}
              </option>
            ))}
          </NativeSelect>
        )}
        {room && !room.available && (
          <span className="text-[10px] text-warning">in use elsewhere</span>
        )}
      </div>

      <div className="flex items-center justify-end gap-0.5">
        {d.explain.length > 0 && <WhyPopover d={d} />}
        {canEdit && (
          <Tooltip
            content={d.locked ? "Locked: kept when re-pairing" : "Lock to keep when re-pairing"}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={d.locked ? "Unlock debate" : "Lock debate"}
              onClick={() => edit({ type: "toggleLock", pairingId: d.id })}
            >
              {d.locked ? <Lock className="text-brand" /> : <Unlock />}
            </Button>
          </Tooltip>
        )}
        {canEdit && !d.bye && !isCongress && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Debate actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onSelect={() => edit({ type: "flipSides", pairingId: d.id }, "Sides flipped")}
              >
                <ArrowLeftRight /> Flip sides
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  edit({ type: "setSidesPending", pairingId: d.id, pending: !d.sidesPending })
                }
              >
                <Shuffle />{" "}
                {d.sidesPending ? "Fix sides (no coin flip)" : "Decide sides by coin flip"}
              </DropdownMenuItem>
              {round.flights > 1 && (
                <DropdownMenuItem
                  onSelect={() =>
                    edit({ type: "setFlight", pairingId: d.id, flight: d.flight === 1 ? 2 : 1 })
                  }
                >
                  <CalendarClock /> Move to flight {d.flight === 1 ? 2 : 1}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Forfeit</DropdownMenuLabel>
              {d.entries.map((e) => (
                <DropdownMenuItem
                  key={e.entryId}
                  onSelect={() =>
                    edit(
                      {
                        type: "setForfeit",
                        pairingId: d.id,
                        entryId: d.forfeitEntryId === e.entryId ? null : e.entryId,
                      },
                      "Forfeit updated",
                    )
                  }
                >
                  <X />{" "}
                  {d.forfeitEntryId === e.entryId
                    ? "Clear forfeit"
                    : `${entries[e.entryId]?.code} forfeits`}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              {d.entries.map((e) => (
                <DropdownMenuItem
                  key={`bye-${e.entryId}`}
                  onSelect={() =>
                    edit(
                      { type: "moveEntry", entryId: e.entryId, toPairingId: null },
                      "Moved to a bye",
                    )
                  }
                >
                  <Undo2 /> Give {entries[e.entryId]?.code} a bye
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </li>
  );
}

function EntryChip({
  pairingId,
  entryId,
  data,
  canEdit,
  selected,
  onClick,
  pulledUp,
  compact,
}: {
  pairingId: string;
  entryId: string;
  data: DrawEditorData;
  canEdit: boolean;
  selected: boolean;
  onClick: (pairingId: string, entryId: string) => void;
  pulledUp?: boolean;
  compact?: boolean;
}) {
  const e = data.entries[entryId];
  const label = e?.code ?? "Unknown";
  const drag = useDraggable({
    id: `entry:${pairingId}:${entryId}`,
    data: { kind: "entry", pairingId, id: entryId, label },
    disabled: !canEdit,
  });
  const drop = useDroppable({
    id: `entry-drop:${pairingId}:${entryId}`,
    data: { kind: "entry", pairingId, id: entryId },
  });
  return (
    <button
      type="button"
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.listeners}
      {...drag.attributes}
      onClick={() => onClick(pairingId, entryId)}
      className={cn(
        "group inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-sm transition",
        selected
          ? "border-brand bg-brand-soft ring-2 ring-brand/30"
          : "border-border bg-surface hover:border-border-strong",
        drop.isOver && !drag.isDragging && "border-brand bg-brand-soft",
        drag.isDragging && "opacity-40",
        !e?.active && "line-through opacity-60",
        compact && "px-1.5 py-0.5 text-xs",
      )}
      title={`${label}${e?.school ? ` · ${e.school}` : ""} · ${e?.record ?? ""}`}
    >
      {canEdit && !compact && (
        <GripVertical
          className="size-3 shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100"
          aria-hidden
        />
      )}
      <span className="truncate font-medium">{label}</span>
      {!compact && <span className="shrink-0 text-xs tabular text-fg-subtle">{e?.record}</span>}
      {pulledUp && (
        <span
          className="shrink-0 rounded bg-warning-soft px-1 text-[10px] font-semibold text-[color-mix(in_oklch,var(--warning)_70%,var(--fg))]"
          title="Pulled up"
        >
          ↑
        </span>
      )}
      {e?.accessible && <span className="sr-only">needs accessible room</span>}
    </button>
  );
}

function JudgeChip({
  pairingId,
  judgeId,
  name,
  role,
  rating,
  canEdit,
  onRemove,
  onChair,
}: {
  pairingId: string | null;
  judgeId: string;
  name: string;
  role?: string;
  rating?: number;
  canEdit: boolean;
  onRemove?: () => void;
  onChair?: () => void;
}) {
  const drag = useDraggable({
    id: `judge:${pairingId ?? "pool"}:${judgeId}`,
    data: { kind: "judge", pairingId, id: judgeId, label: name },
    disabled: !canEdit,
  });
  const chair = role === "chair" || role === "parliamentarian";
  return (
    <span
      ref={drag.setNodeRef}
      className={cn(
        "group inline-flex items-center gap-1 rounded-full border border-border bg-surface-2 py-0.5 pl-2 pr-1 text-xs",
        chair && "border-brand/40 bg-brand-soft text-brand-soft-fg",
        role === "trainee" && "border-dashed",
        drag.isDragging && "opacity-40",
      )}
    >
      <span
        {...drag.listeners}
        {...drag.attributes}
        className={cn("inline-flex items-center gap-1", canEdit && "cursor-grab")}
      >
        {chair && <Crown className="size-3" aria-label={role} />}
        <span className="max-w-32 truncate font-medium">{name}</span>
        {rating !== undefined && <span className="tabular text-fg-subtle">{rating}</span>}
      </span>
      {canEdit && onChair && !chair && (
        <button
          type="button"
          onClick={onChair}
          className="rounded-full p-0.5 text-fg-subtle opacity-0 hover:text-brand group-hover:opacity-100"
          aria-label={`Make ${name} chair`}
        >
          <Crown className="size-3" />
        </button>
      )}
      {canEdit && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-0.5 text-fg-subtle hover:bg-surface-3 hover:text-danger"
          aria-label={`Remove ${name}`}
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

function WhyPopover({ d }: { d: Debate }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip content="Why this pairing?">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Why this pairing?"
          onClick={() => setOpen(true)}
        >
          <CircleHelp />
        </Button>
      </Tooltip>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          size="sm"
          title="Why this pairing?"
          description="Costs the engine weighed for this debate. Lower is better; zero means the constraint was fully satisfied."
        >
          {d.explain.length === 0 ? (
            <p className="text-sm text-fg-muted">
              This debate satisfied every constraint perfectly.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {d.explain.map((t, i) => (
                <li key={i} className="flex items-start justify-between gap-4 text-sm">
                  <div>
                    <div className="font-medium">
                      {(TERM_LABELS as Record<string, string>)[t.term] ??
                        (t.term === "elimSides" ? "Sides" : t.term)}
                    </div>
                    <div className="text-xs text-fg-muted">{t.detail}</div>
                  </div>
                  <span className="font-mono text-xs tabular text-fg-muted">
                    {t.cost.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function IssuesPanel({ findings }: { findings: Finding[] }) {
  const shown = findings.filter(
    (f) => f.severity !== "info" || f.code === "pullup" || f.code === "bye",
  );
  if (shown.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface p-6 text-center shadow-soft">
        <CheckCircle2 className="size-6 text-success" aria-hidden />
        <p className="font-medium">All clear</p>
        <p className="text-sm text-fg-muted">
          No double-bookings, conflicts, same-school debates or missing rooms.
        </p>
      </div>
    );
  }
  const order = { error: 0, warning: 1, info: 2 } as const;
  return (
    <ul className="max-h-[70vh] space-y-2 overflow-y-auto">
      {[...shown]
        .sort((a, b) => order[a.severity] - order[b.severity])
        .map((f, i) => {
          const Icon =
            f.severity === "error" ? AlertOctagon : f.severity === "warning" ? AlertTriangle : Info;
          const target = f.pairingKeys?.[0];
          return (
            <li key={i}>
              <a
                href={target ? `#debate-${target}` : undefined}
                className={cn(
                  "flex gap-2.5 rounded-lg border p-3 text-sm transition",
                  f.severity === "error"
                    ? "border-danger/30 bg-danger-soft"
                    : f.severity === "warning"
                      ? "border-warning/40 bg-warning-soft"
                      : "border-border bg-surface",
                  target && "hover:brightness-[0.98]",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    f.severity === "error"
                      ? "text-danger"
                      : f.severity === "warning"
                        ? "text-warning"
                        : "text-fg-subtle",
                  )}
                  aria-hidden
                />
                <span>
                  <span className="block">{f.message}</span>
                  {f.hint && <span className="mt-0.5 block text-xs text-fg-muted">{f.hint}</span>}
                </span>
              </a>
            </li>
          );
        })}
    </ul>
  );
}

function JudgePool({
  judges,
  selected,
  onSelect,
  canEdit,
}: {
  judges: DrawEditorData["judges"];
  selected: string | null;
  onSelect: (id: string | null) => void;
  canEdit: boolean;
}) {
  const [q, setQ] = useState("");
  const { setNodeRef, isOver } = useDroppable({
    id: "pool",
    data: { kind: "pool", pairingId: null },
  });
  const available = judges.filter((j) => j.available && !j.trainee && matches(q, j.name, j.school));
  const unavailable = judges.filter(
    (j) => (!j.available || j.trainee) && matches(q, j.name, j.school),
  );
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "space-y-3 rounded-xl border border-border bg-surface p-3 shadow-soft transition",
        isOver && "border-brand bg-brand-soft/40",
      )}
    >
      <Input
        placeholder="Search unplaced judges"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-8"
        aria-label="Search unplaced judges"
      />
      <p className="text-xs text-fg-subtle">
        Drag onto a debate — or click, then “Add judge”. Drop a placed judge here to remove them.
      </p>
      <ul className="max-h-[55vh] space-y-1 overflow-y-auto">
        {available.length === 0 && (
          <li className="py-3 text-center text-sm text-fg-muted">
            Every available judge is placed.
          </li>
        )}
        {available.map((j) => (
          <li key={j.id}>
            <button
              type="button"
              disabled={!canEdit}
              onClick={() => onSelect(selected === j.id ? null : j.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2",
                selected === j.id && "bg-brand-soft ring-1 ring-brand/40",
              )}
            >
              <JudgeChip
                pairingId={null}
                judgeId={j.id}
                name={j.name}
                rating={j.rating}
                canEdit={canEdit}
              />
              <span className="ml-auto text-right text-[11px] leading-tight text-fg-subtle">
                {j.school ?? "hired"}
                <br />
                {j.judged}/{j.owed || "–"} rds
              </span>
            </button>
          </li>
        ))}
      </ul>
      {unavailable.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-fg-muted">
            {unavailable.length} unavailable
          </summary>
          <ul className="mt-2 space-y-1">
            {unavailable.map((j) => (
              <li key={j.id} className="flex justify-between gap-2 text-xs text-fg-muted">
                <span>{j.name}</span>
                <span>
                  {j.trainee
                    ? "trainee"
                    : j.busyElsewhere
                      ? "judging elsewhere"
                      : j.owesBallot
                        ? "owes a ballot"
                        : "unavailable"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function HistoryPanel({
  history,
  canRevert,
  onRevert,
}: {
  history: DrawEditorData["history"];
  canRevert: boolean;
  onRevert: (id: string) => void;
}) {
  if (history.length === 0)
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">
        No changes yet.
      </p>
    );
  return (
    <ol className="max-h-[70vh] space-y-1 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-soft">
      {history.map((h) => (
        <li
          key={h.id}
          className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-surface-2"
        >
          <History className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <div className="truncate">{h.summary}</div>
            <div className="text-xs text-fg-subtle">
              {h.actor} · {timeAgo(h.at)}
            </div>
          </div>
          {canRevert &&
            (h.action.startsWith("round.edit") ||
              h.action === "round.generate" ||
              h.action === "round.judges" ||
              h.action === "round.revert") && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs opacity-0 group-hover:opacity-100 focus:opacity-100"
                onClick={() => onRevert(h.id)}
              >
                <Undo2 /> Undo
              </Button>
            )}
        </li>
      ))}
    </ol>
  );
}

function PublishDialog({
  open,
  onOpenChange,
  errors,
  warnings,
  onPublish,
  pending,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  errors: Finding[];
  warnings: Finding[];
  onPublish: (opts: { force?: boolean; notify?: boolean; at?: string | null }) => void;
  pending: boolean;
  tournamentId: string;
}) {
  const [notify, setNotify] = useState(true);
  const [force, setForce] = useState(false);
  const [schedule, setSchedule] = useState(false);
  const [at, setAt] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Publish round"
        description="Publishing makes pairings public, creates ballots for judges, and (optionally) notifies followers."
      >
        <div className="space-y-4">
          {errors.length > 0 ? (
            <Alert
              tone="danger"
              icon={AlertOctagon}
              title={`${errors.length} blocking issue${errors.length === 1 ? "" : "s"}`}
            >
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {errors.slice(0, 5).map((f, i) => (
                  <li key={i}>{f.message}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert tone="success" icon={CheckCircle2} title="Pre-publish checks passed">
              {warnings.length
                ? `${warnings.length} warning(s) — review them in the Issues tab.`
                : "No conflicts, double-bookings or missing rooms."}
            </Alert>
          )}
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="font-medium">Notify followers</span>
              <span className="block text-xs text-fg-muted">
                Push notifications and emails to judges, competitors and followers.
              </span>
            </span>
            <Switch checked={notify} onCheckedChange={setNotify} />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="font-medium">Schedule for later</span>
              <span className="block text-xs text-fg-muted">
                Publish automatically at a set time.
              </span>
            </span>
            <Switch checked={schedule} onCheckedChange={setSchedule} />
          </label>
          {schedule && (
            <Input
              type="datetime-local"
              value={at}
              onChange={(e) => setAt(e.target.value)}
              aria-label="Publish at"
            />
          )}
          {errors.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={force}
                onChange={(e) => setForce(e.target.checked)}
                className="size-4 accent-[var(--danger)]"
              />
              Publish anyway — I&apos;ve reviewed the issues
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              loading={pending}
              disabled={(errors.length > 0 && !force) || (schedule && !at)}
              onClick={() =>
                onPublish({ force, notify, at: schedule && at ? new Date(at).toISOString() : null })
              }
            >
              <Send /> {schedule ? "Schedule" : "Publish now"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
