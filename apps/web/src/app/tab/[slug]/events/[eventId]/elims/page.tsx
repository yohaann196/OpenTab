import {
  buildBracket,
  computeStandings,
  getBreak,
  getEvent,
  listRounds,
  nextElimLabel,
  publishedBracket,
} from "@opentab/core";
import type { DebateConfig } from "@opentab/engine";
import { db } from "@/lib/db";
import { BreakEditor } from "./break-editor";

export default async function ElimsPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const ev = await getEvent(db(), eventId);
  const [standings, brk, bracket, rounds, next, pub] = await Promise.all([
    computeStandings(db(), eventId),
    getBreak(db(), eventId),
    buildBracket(db(), eventId),
    listRounds(db(), eventId),
    nextElimLabel(db(), eventId),
    publishedBracket(db(), eventId),
  ]);
  const cfg = ev.config as DebateConfig;
  const prelims = rounds.filter((r) => r.stage === "prelim");
  const unfinished = prelims.filter((r) => r.status === "draft").length;
  return (
    <BreakEditor
      slug={slug}
      eventId={eventId}
      standings={standings}
      currentBreak={brk.map((b) => b.entryId)}
      bracket={JSON.parse(JSON.stringify(bracket))}
      sideLabels={cfg.sideLabels}
      prelimsDone={prelims.length >= cfg.prelimRounds && unfinished === 0}
      nextElim={bracket.champion ? null : next}
      bracketPublished={!!pub}
    />
  );
}
