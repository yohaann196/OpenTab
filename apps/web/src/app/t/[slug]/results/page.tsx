import { publicTournament } from "@opentab/core";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";

export default async function ResultsIndex({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) notFound();
  if (data.events[0]) redirect(`/t/${slug}/results/${data.events[0].id}`);
  notFound();
}
