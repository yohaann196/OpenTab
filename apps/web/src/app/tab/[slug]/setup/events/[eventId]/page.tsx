import { getEvent, listJudgePools, requireTournamentBySlug } from "@opentab/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { EventConfigEditor } from "./config-editor";

export default async function EventSettingsPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const { role } = await requireStaff(t.id);
  const ev = await getEvent(db(), eventId);
  const pools = await listJudgePools(db(), t.id);
  return (
    <div className="space-y-6">
      <Link
        href={`/tab/${slug}/events/${eventId}`}
        className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"
      >
        <ArrowLeft className="size-4" /> {ev.name}
      </Link>
      <PageHeader
        title={`${ev.name} settings`}
        description="Every rule OpenTab uses for this event — with plain-English explanations. Changes apply to rounds you pair from now on."
      />
      <EventConfigEditor
        slug={slug}
        event={{
          id: ev.id,
          name: ev.name,
          abbreviation: ev.abbreviation,
          format: ev.format,
          judgePoolId: ev.judgePoolId,
        }}
        config={ev.config}
        pools={pools.map((p) => ({ id: p.id, name: p.name }))}
        canEdit={role === "owner" || role === "director"}
      />
    </div>
  );
}
