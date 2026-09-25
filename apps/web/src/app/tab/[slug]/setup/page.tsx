import {
  listEvents,
  listMembers,
  listTimeslots,
  ROLE_DESCRIPTIONS,
  requireTournamentBySlug,
} from "@opentab/core";
import { PageHeader } from "@/components/ui/misc";
import { db } from "@/lib/db";
import { requireStaff } from "@/lib/session";
import { SetupClient } from "./setup-client";

export default async function SetupPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await requireTournamentBySlug(db(), slug);
  const { role, actor } = await requireStaff(t.id);
  const [events, timeslots, members] = await Promise.all([
    listEvents(db(), t.id),
    listTimeslots(db(), t.id),
    listMembers(db(), t.id),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Setup"
        description="Tournament details, events, schedule, privacy and staff."
      />
      <SetupClient
        slug={slug}
        me={actor.userId}
        canManage={role === "owner" || role === "director"}
        tournament={{
          id: t.id,
          name: t.name,
          location: t.location,
          description: t.description,
          timezone: t.timezone,
          startsOn: t.startsOn,
          endsOn: t.endsOn,
          status: t.status,
          visibility: t.visibility,
          settings: t.settings ?? {},
        }}
        events={events.map((e) => ({
          id: e.id,
          name: e.name,
          abbreviation: e.abbreviation,
          format: e.format,
        }))}
        timeslots={timeslots.map((s) => ({
          id: s.id,
          label: s.label,
          startsAt: s.startsAt?.toISOString() ?? null,
        }))}
        members={members}
        roleDescriptions={ROLE_DESCRIPTIONS}
      />
    </div>
  );
}
