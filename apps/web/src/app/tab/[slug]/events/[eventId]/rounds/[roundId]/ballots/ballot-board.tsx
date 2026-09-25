"use client";

import {
  BellRing,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  PencilLine,
  PlayCircle,
  RotateCcw,
  Trophy,
} from "lucide-react";
import { useState } from "react";
import {
  getBallotFormAction,
  nagMissingAction,
  setBallotStatusAction,
  tabSaveBallotAction,
} from "@/app/tab/actions";
import { BallotForm } from "@/components/ballot/ballot-form";
import type { BallotFormData } from "@/components/ballot/types";
import { LiveRefresh } from "@/components/live/live-refresh";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress, Stat } from "@/components/ui/misc";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAction } from "@/lib/use-action";
import { cn, timeAgo } from "@/lib/utils";

type Board = {
  counts: {
    total: number;
    pending: number;
    draft: number;
    submitted: number;
    confirmed: number;
    started: number;
  };
  rows: {
    pairingId: string;
    label: string | null;
    flight: number;
    bye: boolean;
    room: string | null;
    winnerEntryId: string | null;
    entries: { entryId: string; side: "A" | "B" | null; code: string }[];
    ballots: {
      id: string;
      judgeName: string;
      status: "pending" | "draft" | "submitted" | "confirmed";
      winnerEntryId: string | null;
      startedAt: string | null;
      submittedAt: string | null;
      source: string;
      correctionRequest: string | null;
      hasRfd: boolean;
    }[];
  }[];
};

const STATUS: Record<string, { tone: "neutral" | "warning" | "success" | "brand"; label: string }> =
  {
    pending: { tone: "neutral", label: "Missing" },
    draft: { tone: "warning", label: "In progress" },
    submitted: { tone: "success", label: "Submitted" },
    confirmed: { tone: "brand", label: "Confirmed" },
  };

export function BallotBoard({
  slug,
  tournamentId,
  round,
  board,
  canConfirm,
}: {
  slug: string;
  tournamentId: string;
  round: { id: string; label: string; status: string };
  board: Board;
  canConfirm: boolean;
}) {
  const [filter, setFilter] = useState("all");
  const [entering, setEntering] = useState<BallotFormData | null>(null);
  const { exec, pending } = useAction();
  const c = board.counts;
  const inCount = c.submitted + c.confirmed;
  const corrections = board.rows
    .flatMap((r) => r.ballots)
    .filter((b) => b.correctionRequest).length;

  const rows = board.rows.filter((r) => {
    if (r.bye) return filter === "all";
    if (filter === "missing")
      return r.ballots.some((b) => b.status === "pending" || b.status === "draft");
    if (filter === "in")
      return (
        r.ballots.length > 0 &&
        r.ballots.every((b) => b.status === "submitted" || b.status === "confirmed")
      );
    if (filter === "corrections") return r.ballots.some((b) => b.correctionRequest);
    return true;
  });

  const openEntry = async (ballotId: string) => {
    const res = await exec(() => getBallotFormAction(ballotId), { quiet: true });
    if (res.ok) setEntering(res.data);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{round.label} — ballots</h2>
          <p className="text-sm text-fg-muted">Updates live as judges submit from their phones.</p>
        </div>
        <div className="flex items-center gap-2">
          <LiveRefresh slug={slug} types={["ballot.updated"]} />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exec(() => nagMissingAction(slug, tournamentId, round.id))}
            disabled={c.pending + c.draft === 0}
            loading={pending}
          >
            <BellRing /> Remind missing judges
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Ballots in"
          value={`${inCount}/${c.total}`}
          sub={
            <Progress
              value={c.total ? (inCount / c.total) * 100 : 0}
              tone={inCount === c.total ? "success" : "brand"}
              className="mt-2"
            />
          }
        />
        <Stat label="Judges started" value={c.started} sub="Tapped “start round”" />
        <Stat label="Missing" value={c.pending + c.draft} sub={`${c.draft} in progress`} />
        <Stat label="Correction requests" value={corrections} />
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="missing">Missing</TabsTrigger>
          <TabsTrigger value="in">Complete</TabsTrigger>
          <TabsTrigger value="corrections">Corrections</TabsTrigger>
        </TabsList>
      </Tabs>

      <ul className="grid gap-3 lg:grid-cols-2">
        {rows.map((r) => (
          <li
            key={r.pairingId}
            className={cn(
              "rounded-xl border border-border bg-surface p-4 shadow-soft",
              r.winnerEntryId && "border-success/30",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium">
                  {r.label ?? r.entries.map((e) => e.code).join(" vs ")}
                </div>
                <div className="text-xs text-fg-muted">
                  {r.room ? `Room ${r.room}` : "No room"}
                  {r.flight > 1 ? ` · Flight ${r.flight}` : ""}
                </div>
              </div>
              {r.bye ? (
                <Badge>Bye</Badge>
              ) : r.winnerEntryId ? (
                <Badge tone="success">
                  <Trophy /> {r.entries.find((e) => e.entryId === r.winnerEntryId)?.code}
                </Badge>
              ) : null}
            </div>
            {!r.bye && (
              <ul className="mt-3 space-y-2">
                {r.ballots.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{b.judgeName}</span>
                    {b.status === "pending" && b.startedAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                        <PlayCircle className="size-3.5" /> started {timeAgo(b.startedAt)}
                      </span>
                    )}
                    {b.submittedAt && (
                      <span className="inline-flex items-center gap-1 text-xs text-fg-muted">
                        <Clock className="size-3.5" /> {timeAgo(b.submittedAt)}
                        {!b.hasRfd && " · RFD pending"}
                      </span>
                    )}
                    <Badge tone={STATUS[b.status]!.tone}>{STATUS[b.status]!.label}</Badge>
                    {b.winnerEntryId && (
                      <span className="text-xs">
                        → {r.entries.find((e) => e.entryId === b.winnerEntryId)?.code}
                      </span>
                    )}
                    <span className="flex gap-1">
                      {(b.status === "pending" || b.status === "draft") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => openEntry(b.id)}
                        >
                          <PencilLine /> Enter
                        </Button>
                      )}
                      {b.status === "submitted" && canConfirm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => exec(() => setBallotStatusAction(slug, b.id, "confirmed"))}
                        >
                          <CheckCircle2 /> Confirm
                        </Button>
                      )}
                      {(b.status === "submitted" || b.status === "confirmed") && canConfirm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => exec(() => setBallotStatusAction(slug, b.id, "draft"))}
                        >
                          <RotateCcw /> Reopen
                        </Button>
                      )}
                    </span>
                    {b.correctionRequest && (
                      <p className="flex w-full items-start gap-1.5 rounded-md bg-warning-soft px-2 py-1.5 text-xs">
                        <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0" />{" "}
                        {b.correctionRequest}
                      </p>
                    )}
                  </li>
                ))}
                {r.ballots.length === 0 && (
                  <li className="text-sm text-danger">No judges assigned.</li>
                )}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={!!entering} onOpenChange={(o) => !o && setEntering(null)}>
        {entering && (
          <DialogContent
            size="lg"
            title={`Enter ballot — ${entering.judgeName}`}
            description="Paper ballot entry. The same validation as the judge's phone ballot applies."
          >
            <BallotForm
              data={entering}
              mode="tab"
              save={async (input) => {
                const res = await tabSaveBallotAction(slug, entering.ballotId, input);
                return res.ok
                  ? { ok: true }
                  : { ok: false, error: res.error, findings: res.findings };
              }}
              onDone={() => setTimeout(() => setEntering(null), 900)}
            />
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
