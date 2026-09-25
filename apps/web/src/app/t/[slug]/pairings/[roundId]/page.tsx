import { pairingsSnapshot, publicTournament } from "@opentab/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PairingsView } from "@/components/public/pairings-view";
import { db } from "@/lib/db";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; roundId: string }>;
}): Promise<Metadata> {
  const { roundId } = await params;
  const snap = await pairingsSnapshot(db(), roundId);
  return { title: snap ? `${snap.round.eventAbbr} ${snap.round.label} pairings` : "Pairings" };
}

export default async function RoundPairingsPage({
  params,
}: {
  params: Promise<{ slug: string; roundId: string }>;
}) {
  const { slug, roundId } = await params;
  const data = await publicTournament(db(), slug);
  const snap = await pairingsSnapshot(db(), roundId);
  if (
    !data ||
    !snap ||
    snap.round.eventId === undefined ||
    !data.events.some((e) => e.id === snap.round.eventId)
  )
    notFound();
  return <PairingsView slug={slug} snapshot={JSON.parse(JSON.stringify(snap))} />;
}
