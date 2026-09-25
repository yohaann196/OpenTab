"use client";

import type { judgeAssignments } from "@opentab/core";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flag,
  Gavel,
  Landmark,
  MapPin,
  Megaphone,
  PlayCircle,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { requestCorrectionViaLink, startRoundViaLink, updateRfdViaLink } from "@/app/p/actions";
import { LiveRefresh } from "@/components/live/live-refresh";
import { Badge, SideBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";

type Assignment = Awaited<ReturnType<typeof judgeAssignments>>[number];

export function JudgePortal({
  token,
  slug,
  name,
  assignments,
}: {
  token: string;
  slug: string;
  name: string;
  assignments: Assignment[];
}) {
  const current = assignments.filter(
    (a) =>
      a.roundStatus === "published" &&
      (!a.ballot || a.ballot.status === "pending" || a.ballot.status === "draft"),
  );
  const past = assignments.filter((a) => !current.includes(a));
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Hi, {name.split(" ")[0]}</h1>
        <LiveRefresh
          slug={slug}
          types={["round.published", "round.updated", "motion.released"]}
          announce={{ "round.published": "A new round was just published" }}
        />
      </div>
      {current.length === 0 ? (
        <EmptyState icon={Gavel} title="No rounds to judge right now">
          This page updates automatically when you&apos;re assigned. Keep it open, or add it to your
          home screen.
        </EmptyState>
      ) : (
        current.map((a) => <CurrentAssignment key={a.pairingId} token={token} a={a} />)
      )}
      {past.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg-muted">Your ballots</h2>
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface shadow-soft">
            {past.map((a) => (
              <PastBallot key={a.pairingId} token={token} a={a} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function CurrentAssignment({ token, a }: { token: string; a: Assignment }) {
  const { exec, pending } = useAction();
  const started = !!a.ballot?.startedAt;
  const isCongress = a.format === "congress";
  return (
    <article className="overflow-hidden rounded-2xl border border-brand/30 bg-surface shadow-lift">
      <div className="bg-brand px-5 py-4 text-brand-fg">
        <div className="text-xs font-medium uppercase tracking-wider opacity-80">
          {a.eventAbbr} · {a.roundLabel}
          {a.flight > 1 ? ` · Flight ${a.flight}` : ""}
        </div>
        <div className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <MapPin className="size-6" aria-hidden /> {a.room ? `Room ${a.room.name}` : "Room TBA"}
        </div>
        {a.startsAt && (
          <div className="mt-1 flex items-center gap-1.5 text-sm opacity-90">
            <Clock className="size-4" aria-hidden />{" "}
            {new Date(a.startsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
          </div>
        )}
      </div>
      <div className="space-y-4 p-5">
        {a.room?.onlineUrl && (
          <Button asChild variant="secondary" className="w-full">
            <a href={a.room.onlineUrl} target="_blank" rel="noreferrer">
              <ExternalLink /> Join online room
            </a>
          </Button>
        )}
        {a.motion && (
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
              <Megaphone className="size-3.5" /> Motion
            </div>
            {a.motion}
          </div>
        )}
        {isCongress ? (
          <div className="flex items-center gap-2 text-sm">
            <Landmark className="size-4 text-brand" aria-hidden />
            <span className="font-medium">{a.label}</span> · {a.entries.length} legislators · you
            are the {a.role}
          </div>
        ) : (
          <ul className="space-y-2">
            {a.entries.map((e) => (
              <li
                key={e.code}
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-3",
                  e.side === "B" ? "border-neg/30 bg-neg-soft/50" : "border-aff/30 bg-aff-soft/50",
                )}
              >
                <SideBadge side={e.side} labels={a.sideLabels} pending={a.sidesPending} />
                <span className="font-semibold">{e.code}</span>
                <span className="truncate text-sm text-fg-muted">{e.name}</span>
              </li>
            ))}
            {a.sidesPending && (
              <p className="text-xs text-fg-muted">
                Sides are decided by a coin flip in the room — you&apos;ll record them on the
                ballot.
              </p>
            )}
          </ul>
        )}
        {a.role === "chair" || a.role === "parliamentarian" ? (
          <Badge tone="brand">You&apos;re the {a.role}</Badge>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {a.ballot && !started && (
            <Button
              variant="secondary"
              size="lg"
              loading={pending}
              onClick={() => exec(() => startRoundViaLink(token, a.ballot!.id))}
            >
              <PlayCircle /> I&apos;m in the room
            </Button>
          )}
          {started && (
            <p className="flex items-center justify-center gap-1.5 rounded-lg bg-success-soft px-3 text-sm text-success">
              <CheckCircle2 className="size-4" /> Round started
            </p>
          )}
          {isCongress && (
            <Button asChild variant="secondary" size="lg">
              <Link href={`/p/${token}/chamber/${a.pairingId}`}>
                <Landmark /> Chamber tracker
              </Link>
            </Button>
          )}
          {a.ballot && (
            <Button asChild size="lg">
              <Link href={`/p/${token}/ballot/${a.ballot.id}`}>
                {a.ballot.status === "draft" ? "Continue ballot" : "Open ballot"} <ArrowRight />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

function PastBallot({ token, a }: { token: string; a: Assignment }) {
  const [open, setOpen] = useState<"rfd" | "correction" | null>(null);
  const [text, setText] = useState(a.ballot?.rfd ?? "");
  const { exec, pending } = useAction();
  const b = a.ballot;
  const canEditRfd = !!b?.rfdDeadline && new Date(b.rfdDeadline) > new Date();
  return (
    <li className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {a.eventAbbr} {a.roundLabel}
        </div>
        <div className="truncate text-xs text-fg-muted">
          {a.label ?? a.entries.map((e) => e.code).join(" vs ")}
        </div>
      </div>
      {b ? (
        <Badge tone={b.status === "confirmed" ? "brand" : "success"}>{b.status}</Badge>
      ) : (
        <Badge>no ballot</Badge>
      )}
      {b && canEditRfd && (
        <Button variant="ghost" size="sm" onClick={() => setOpen("rfd")}>
          {b.rfd ? "Edit RFD" : "Add RFD"}
        </Button>
      )}
      {b && (b.status === "submitted" || b.status === "confirmed") && (
        <Button variant="ghost" size="sm" onClick={() => setOpen("correction")}>
          <Flag /> Correction
        </Button>
      )}
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && b && (
          <DialogContent
            title={open === "rfd" ? "Reason for decision" : "Request a correction"}
            description={
              open === "rfd"
                ? `You can edit this until ${new Date(b.rfdDeadline!).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" })}.`
                : "Tell the tab room what's wrong (e.g. “I clicked the wrong winner”). They'll fix it — no need to walk over."
            }
          >
            <div className="space-y-3">
              <Textarea
                rows={open === "rfd" ? 8 : 4}
                value={open === "rfd" ? text : undefined}
                defaultValue={open === "correction" ? "" : undefined}
                onChange={(e) => setText(e.target.value)}
                aria-label={open === "rfd" ? "RFD" : "Correction details"}
              />
              <div className="flex justify-end">
                <Button
                  loading={pending}
                  onClick={async () => {
                    const res = await exec(() =>
                      open === "rfd"
                        ? updateRfdViaLink(token, b.id, text)
                        : requestCorrectionViaLink(token, b.id, text),
                    );
                    if (res.ok) setOpen(null);
                  }}
                >
                  {open === "rfd" ? "Save RFD" : "Send to tab"}
                </Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </li>
  );
}
