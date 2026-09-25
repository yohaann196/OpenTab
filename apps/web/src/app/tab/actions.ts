"use server";

import type { Role } from "@opentab/core";
import * as core from "@opentab/core";
import type { Format } from "@opentab/engine";
import { revalidatePath } from "next/cache";
import { type ActionResult, run } from "@/lib/actions";
import { db } from "@/lib/db";
import { queue } from "@/lib/queue";
import { requireUser } from "@/lib/session";

/**
 * Tab-room server actions. Each one authenticates, delegates to a core
 * service (which authorizes, validates, audits and emits realtime events),
 * then revalidates the tab room.
 */

const refresh = (slug: string) => revalidatePath(`/tab/${slug}`, "layout");

// ---------------------------------------------------------------------------
// Tournament
// ---------------------------------------------------------------------------

export async function createTournamentAction(
  input: core.CreateTournamentInput,
): Promise<ActionResult<{ slug: string }>> {
  const actor = await requireUser();
  return run(async () => {
    const t = await core.createTournament(db(), actor, input);
    return { slug: t.slug };
  });
}

export async function checkSlugAction(slug: string): Promise<boolean> {
  await requireUser();
  if (!core.slugSchema.safeParse(slug).success) return false;
  return core.isSlugAvailable(db(), slug);
}

export async function updateTournamentAction(
  slug: string,
  tournamentId: string,
  patch: Parameters<typeof core.updateTournament>[3],
) {
  const actor = await requireUser();
  const res = await run(() => core.updateTournament(db(), actor, tournamentId, patch), "Saved");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function addEventAction(
  slug: string,
  tournamentId: string,
  input: { format: Format; name: string; abbreviation: string },
) {
  const actor = await requireUser();
  const res = await run(() => core.addEvent(db(), actor, tournamentId, input), "Event added");
  refresh(slug);
  return res;
}

export async function updateEventAction(
  slug: string,
  eventId: string,
  patch: Parameters<typeof core.updateEventConfig>[3],
) {
  const actor = await requireUser();
  const res = await run(async () => {
    await core.updateEventConfig(db(), actor, eventId, patch);
    return null;
  }, "Event settings saved");
  refresh(slug);
  return res;
}

export async function deleteEventAction(slug: string, eventId: string) {
  const actor = await requireUser();
  const res = await run(() => core.deleteEvent(db(), actor, eventId), "Event deleted");
  refresh(slug);
  return res;
}

export async function upsertTimeslotAction(
  slug: string,
  tournamentId: string,
  input: { id?: string; label: string; startsAt?: string | null },
) {
  const actor = await requireUser();
  const res = await run(async () => {
    await core.upsertTimeslot(db(), actor, tournamentId, {
      ...input,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
    });
    return null;
  }, "Timeslot saved");
  refresh(slug);
  return res;
}

export async function deleteTimeslotAction(slug: string, tournamentId: string, id: string) {
  const actor = await requireUser();
  const res = await run(() => core.deleteTimeslot(db(), actor, tournamentId, id));
  refresh(slug);
  return res;
}

export async function setMemberAction(
  slug: string,
  tournamentId: string,
  email: string,
  role: Role,
) {
  const actor = await requireUser();
  const res = await run(
    () => core.setMember(db(), actor, tournamentId, email, role),
    "Staff updated",
  );
  refresh(slug);
  return res;
}

export async function removeMemberAction(slug: string, tournamentId: string, userId: string) {
  const actor = await requireUser();
  const res = await run(() => core.removeMember(db(), actor, tournamentId, userId), "Removed");
  refresh(slug);
  return res;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

export async function saveSchoolAction(
  slug: string,
  tournamentId: string,
  input: Parameters<typeof core.saveSchool>[3],
) {
  const actor = await requireUser();
  const res = await run(
    async () => (await core.saveSchool(db(), actor, tournamentId, input)).id,
    "School saved",
  );
  refresh(slug);
  return res;
}

export async function saveEntryAction(
  slug: string,
  tournamentId: string,
  input: Parameters<typeof core.saveEntry>[3],
) {
  const actor = await requireUser();
  const res = await run(
    async () => (await core.saveEntry(db(), actor, tournamentId, input)).id,
    "Entry saved",
  );
  refresh(slug);
  return res;
}

export async function setEntryStatusAction(
  slug: string,
  tournamentId: string,
  entryId: string,
  status: "active" | "dropped" | "waitlisted",
) {
  const actor = await requireUser();
  const res = await run(
    async () => {
      await core.setEntryStatus(db(), actor, tournamentId, entryId, status);
      return null;
    },
    status === "dropped" ? "Entry dropped" : "Entry updated",
  );
  refresh(slug);
  return res;
}

export async function saveJudgeAction(
  slug: string,
  tournamentId: string,
  input: Parameters<typeof core.saveJudge>[3],
) {
  const actor = await requireUser();
  const res = await run(
    async () => (await core.saveJudge(db(), actor, tournamentId, input)).id,
    "Judge saved",
  );
  refresh(slug);
  return res;
}

export async function saveRoomAction(
  slug: string,
  tournamentId: string,
  input: Parameters<typeof core.saveRoom>[3],
) {
  const actor = await requireUser();
  const res = await run(
    async () => (await core.saveRoom(db(), actor, tournamentId, input)).id,
    "Room saved",
  );
  refresh(slug);
  return res;
}

export async function deleteRecordAction(
  slug: string,
  tournamentId: string,
  kind: "school" | "entry" | "judge" | "room",
  id: string,
) {
  const actor = await requireUser();
  const res = await run(() => core.deleteRecord(db(), actor, tournamentId, kind, id), "Deleted");
  refresh(slug);
  return res;
}

export async function addConflictAction(
  slug: string,
  tournamentId: string,
  input: Parameters<typeof core.addConflict>[3],
) {
  const actor = await requireUser();
  const res = await run(async () => {
    await core.addConflict(db(), actor, tournamentId, input);
    return null;
  }, "Conflict added");
  refresh(slug);
  return res;
}

export async function removeConflictAction(slug: string, tournamentId: string, id: string) {
  const actor = await requireUser();
  const res = await run(
    () => core.removeConflict(db(), actor, tournamentId, id),
    "Conflict removed",
  );
  refresh(slug);
  return res;
}

export async function setJudgeBlocksAction(
  slug: string,
  tournamentId: string,
  judgeId: string,
  timeslotIds: string[],
) {
  const actor = await requireUser();
  const res = await run(
    () => core.setJudgeBlocks(db(), actor, tournamentId, judgeId, timeslotIds),
    "Availability saved",
  );
  refresh(slug);
  return res;
}

export async function checkInJudgeAction(
  slug: string,
  tournamentId: string,
  judgeId: string,
  checkedIn: boolean,
) {
  const actor = await requireUser();
  const res = await run(() => core.checkInJudge(db(), actor, tournamentId, judgeId, checkedIn));
  refresh(slug);
  return res;
}

export async function previewImportAction(
  tournamentId: string,
  kind: core.ImportKind,
  csvText: string,
  mapping?: Record<string, number | null>,
): Promise<
  ActionResult<{
    headers: string[];
    mapping: Record<string, number | null>;
    rows: core.PreviewRow[];
  }>
> {
  const actor = await requireUser();
  return run(async () => {
    await core.requireRole(db(), actor, tournamentId, "tabber");
    const csv = core.parseCsv(csvText);
    if (csv.headers.length === 0) throw core.invalid("That file looks empty.");
    const m = mapping ?? core.guessMapping(kind, csv.headers);
    const events = await core.listEvents(db(), tournamentId);
    const rows = core.previewImport(kind, csv, m, {
      eventAbbrs: events.map((e) => e.abbreviation),
    });
    return { headers: csv.headers, mapping: m, rows };
  });
}

export async function commitImportAction(
  slug: string,
  tournamentId: string,
  kind: core.ImportKind,
  rows: core.PreviewRow[],
) {
  const actor = await requireUser();
  const res = await run(() => core.commitImport(db(), actor, tournamentId, kind, rows));
  refresh(slug);
  return res;
}

// ---------------------------------------------------------------------------
// Rounds
// ---------------------------------------------------------------------------

export async function createRoundAction(
  slug: string,
  eventId: string,
  input: Parameters<typeof core.createRound>[3],
) {
  const actor = await requireUser();
  const res = await run(
    async () => (await core.createRound(db(), actor, eventId, input)).id,
    "Round created",
  );
  refresh(slug);
  return res;
}

export async function updateRoundAction(
  slug: string,
  roundId: string,
  input: Parameters<typeof core.updateRound>[3],
) {
  const actor = await requireUser();
  const res = await run(async () => {
    await core.updateRound(db(), actor, roundId, input);
    return null;
  }, "Round updated");
  refresh(slug);
  return res;
}

export async function deleteRoundAction(slug: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(() => core.deleteRound(db(), actor, roundId), "Round deleted");
  refresh(slug);
  return res;
}

export async function generateDraftAction(
  slug: string,
  roundId: string,
  opts?: core.GenerateOptions,
) {
  const actor = await requireUser();
  const res = await run(() => core.generateDraft(db(), actor, roundId, opts));
  refresh(slug);
  return res;
}

export async function allocateJudgesAction(slug: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(() => core.allocateJudgesForRound(db(), actor, roundId), "Judges placed");
  refresh(slug);
  return res;
}

export async function allocateRoomsAction(slug: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(() => core.allocateRoomsForRound(db(), actor, roundId), "Rooms placed");
  refresh(slug);
  return res;
}

export async function applyEditAction(slug: string, roundId: string, op: core.EditOp) {
  const actor = await requireUser();
  const res = await run(() => core.applyEdit(db(), actor, roundId, op));
  refresh(slug);
  return res;
}

export async function checkRoundAction(roundId: string) {
  await requireUser();
  return run(() => core.checkRoundDraft(db(), roundId));
}

export async function publishRoundAction(
  slug: string,
  roundId: string,
  opts: { force?: boolean; notify?: boolean; at?: string | null },
) {
  const actor = await requireUser();
  const res = await run(
    () =>
      core.publishRound(db(), actor, roundId, queue, {
        ...opts,
        at: opts.at ? new Date(opts.at) : null,
      }),
    opts.at ? "Publication scheduled" : "Round published",
  );
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function unpublishRoundAction(slug: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(() => core.unpublishRound(db(), actor, roundId), "Round unpublished");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function republishRoundAction(slug: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(async () => {
    const r = await core.loadRound(db(), roundId);
    await core.requireRole(db(), actor, r.tournamentId, "tabber");
    await core.republishIfPublished(db(), roundId);
    await core.emit(db(), r.tournamentId, { type: "round.published", roundId, eventId: r.eventId });
    return null;
  }, "Public pairings updated");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function setRoundCompletedAction(slug: string, roundId: string, completed: boolean) {
  const actor = await requireUser();
  const res = await run(
    () => core.setRoundCompleted(db(), actor, roundId, completed),
    completed ? "Round completed" : "Round reopened",
  );
  refresh(slug);
  return res;
}

export async function releaseMotionAction(slug: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(() => core.releaseMotion(db(), actor, roundId, queue), "Motion released");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function setBallotsReleasedAction(slug: string, roundId: string, released: boolean) {
  const actor = await requireUser();
  const res = await run(
    () => core.setBallotsReleased(db(), actor, roundId, released),
    released ? "Ballots released to entries" : "Ballots hidden",
  );
  refresh(slug);
  return res;
}

export async function revertRoundAction(
  slug: string,
  roundId: string,
  auditId: string,
  which: "before" | "after",
) {
  const actor = await requireUser();
  const res = await run(async () => {
    const entry = await db().query.auditLog.findFirst({ where: (a, { eq }) => eq(a.id, auditId) });
    if (!entry) throw core.notFound("History entry");
    const draw = (which === "before" ? entry.before : entry.after) as
      | core.SerializedPairing[]
      | null;
    if (!Array.isArray(draw)) throw core.invalid("That history entry has no draw to restore");
    return core.revertRound(db(), actor, roundId, draw);
  }, "Draw restored");
  refresh(slug);
  return res;
}

// ---------------------------------------------------------------------------
// Ballots, standings, elims, links
// ---------------------------------------------------------------------------

export async function tabSaveBallotAction(slug: string, ballotId: string, input: core.BallotInput) {
  const actor = await requireUser();
  const res = await run(async () => {
    const out = await core.saveBallot(db(), actor, ballotId, input, "submit");
    return { warnings: out.warnings };
  }, "Ballot entered");
  refresh(slug);
  return res;
}

export async function setBallotStatusAction(
  slug: string,
  ballotId: string,
  status: "confirmed" | "draft",
) {
  const actor = await requireUser();
  const res = await run(
    () => core.setBallotStatus(db(), actor, ballotId, status),
    status === "confirmed" ? "Ballot confirmed" : "Ballot reopened",
  );
  refresh(slug);
  return res;
}

export async function nagMissingAction(slug: string, tournamentId: string, roundId: string) {
  const actor = await requireUser();
  const res = await run(async () => {
    await core.requireRole(db(), actor, tournamentId, "tabber");
    await queue.enqueue("notify.ballotReminder", { tournamentId, roundId });
    return null;
  }, "Reminders sent to judges with missing ballots");
  refresh(slug);
  return res;
}

export async function publishStandingsAction(slug: string, eventId: string) {
  const actor = await requireUser();
  const res = await run(() => core.publishStandings(db(), actor, eventId), "Standings published");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function unpublishStandingsAction(slug: string, eventId: string) {
  const actor = await requireUser();
  const res = await run(() => core.unpublishStandings(db(), actor, eventId), "Standings hidden");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function createBreakAction(
  slug: string,
  eventId: string,
  size: number,
  order?: string[],
) {
  const actor = await requireUser();
  const res = await run(() => core.createBreak(db(), actor, eventId, size, order), "Break saved");
  refresh(slug);
  return res;
}

export async function publishBracketAction(slug: string, eventId: string) {
  const actor = await requireUser();
  const res = await run(() => core.publishBracket(db(), actor, eventId), "Bracket published");
  refresh(slug);
  revalidatePath(`/t/${slug}`, "layout");
  return res;
}

export async function ensureTokensAction(slug: string, tournamentId: string) {
  const actor = await requireUser();
  const res = await run(() => core.ensureTokens(db(), actor, tournamentId));
  refresh(slug);
  return res;
}

export async function rotateTokenAction(
  slug: string,
  tournamentId: string,
  subjectType: "judge" | "entry",
  subjectId: string,
) {
  const actor = await requireUser();
  const res = await run(
    () => core.rotateToken(db(), actor, tournamentId, subjectType, subjectId),
    "New link created; the old one no longer works",
  );
  refresh(slug);
  return res;
}
