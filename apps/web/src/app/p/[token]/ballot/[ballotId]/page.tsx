import { getBallotContext } from "@opentab/core";
import { ArrowLeft, ExternalLink, MapPin, Megaphone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ballotFormData } from "@/lib/ballot-data";
import { db } from "@/lib/db";
import { getTokenActor } from "@/lib/session";
import { JudgeBallot } from "./judge-ballot";

export const dynamic = "force-dynamic";

export default async function PortalBallotPage({
  params,
}: {
  params: Promise<{ token: string; ballotId: string }>;
}) {
  const { token, ballotId } = await params;
  const t = await getTokenActor(token);
  if (!t || t.resolved.subjectType !== "judge") notFound();
  const ctx = await getBallotContext(db(), ballotId).catch(() => null);
  if (!ctx || ctx.ballot.judgeId !== t.resolved.subjectId) notFound();
  const data = await ballotFormData(ballotId);
  return (
    <div className="space-y-4">
      <Link
        href={`/p/${token}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> My rounds
      </Link>
      <div className="space-y-1">
        <div className="text-xs font-medium uppercase tracking-wider text-fg-subtle">
          {data.eventName} · {data.roundLabel}
        </div>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight">
          <MapPin className="size-5 text-brand" aria-hidden />{" "}
          {data.roomName ? `Room ${data.roomName}` : "Your ballot"}
        </h1>
        {data.onlineUrl && (
          <a
            href={data.onlineUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
          >
            <ExternalLink className="size-3.5" /> Online room
          </a>
        )}
      </div>
      {data.motion && (
        <div className="rounded-2xl bg-surface-2 p-4 text-sm">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-fg-muted">
            <Megaphone className="size-3.5" /> Motion
          </div>
          {data.motion}
        </div>
      )}
      <JudgeBallot token={token} data={data} />
    </div>
  );
}
