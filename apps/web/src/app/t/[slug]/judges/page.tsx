import { publicJudges, publicTournament } from "@opentab/core";
import { notFound } from "next/navigation";
import { JudgeDirectory } from "@/components/public/judge-directory";
import { db } from "@/lib/db";

export const revalidate = 300;

/** Render on first visit, then serve from cache (ISR) — invalidated on publish. */
export async function generateStaticParams() {
  return [];
}

export default async function JudgesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await publicTournament(db(), slug);
  if (!data) notFound();
  const judges = await publicJudges(db(), data.tournament.id);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Judges &amp; paradigms</h1>
        <p className="text-sm text-fg-muted">
          Search by name or by what judges say in their paradigms (e.g. “speed”, “theory”,
          “weighing”).
        </p>
      </div>
      <JudgeDirectory judges={judges} />
    </div>
  );
}
