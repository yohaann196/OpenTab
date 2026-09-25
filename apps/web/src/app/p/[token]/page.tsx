import { entryPortalData, judgeAssignments } from "@opentab/core";
import { notFound } from "next/navigation";
import { EntryPortal } from "@/components/portal/entry-portal";
import { JudgePortal } from "@/components/portal/judge-portal";
import { db } from "@/lib/db";
import { getTokenActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await getTokenActor(token);
  if (!t) notFound();
  if (t.resolved.subjectType === "judge") {
    const assignments = await judgeAssignments(db(), t.resolved.subjectId);
    return (
      <JudgePortal
        token={token}
        slug={t.resolved.tournamentSlug}
        name={t.resolved.name}
        assignments={JSON.parse(JSON.stringify(assignments))}
      />
    );
  }
  const data = await entryPortalData(db(), t.resolved.subjectId);
  return <EntryPortal token={token} data={JSON.parse(JSON.stringify(data))} />;
}
