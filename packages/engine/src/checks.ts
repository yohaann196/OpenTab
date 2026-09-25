import { judgeEligibility } from "./allocation/judges";
import type { PrefValue } from "./allocation/prefs";
import type { DebateConfig, JudgingSettings } from "./formats/schemas";
import { buildRecords } from "./pairing/records";
import type { DebateResult, EntryInfo, Finding, JudgeInfo, RoomInfo, Side } from "./types";

/**
 * Pre-publish "disaster check". Runs on every draft edit so the draw editor can
 * show live warnings, and blocks publishing on errors unless overridden.
 */

export interface DraftDebate {
  key: string;
  entries: { entryId: string; side: Side | null }[];
  judgeIds: string[];
  roomId: string | null;
  flight: number;
  bye?: boolean;
}

export interface CheckContext {
  entries: readonly EntryInfo[];
  judges: readonly JudgeInfo[];
  rooms: readonly RoomInfo[];
  results: readonly DebateResult[];
  roundSeq: number;
  /** Two-team config; omit for congress. */
  config?: DebateConfig;
  judging: JudgingSettings;
  panelSize: number;
  prefs?: ReadonlyMap<string, ReadonlyMap<string, PrefValue>>;
  /** Judges/rooms already used by other events in the same timeslot. */
  busyJudgeIds?: ReadonlySet<string>;
  busyRoomIds?: ReadonlySet<string>;
  /** Congress chambers have many entries and no sides. */
  kind?: "two_team" | "congress";
}

export function checkRound(draft: readonly DraftDebate[], ctx: CheckContext): Finding[] {
  const out: Finding[] = [];
  const entryById = new Map(ctx.entries.map((e) => [e.id, e]));
  const judgeById = new Map(ctx.judges.map((j) => [j.id, j]));
  const roomById = new Map(ctx.rooms.map((r) => [r.id, r]));
  const code = (id: string) => entryById.get(id)?.code ?? id;
  const kind = ctx.kind ?? "two_team";

  // Every active entry appears exactly once.
  const seen = new Map<string, string[]>();
  for (const d of draft)
    for (const e of d.entries) seen.set(e.entryId, [...(seen.get(e.entryId) ?? []), d.key]);
  for (const e of ctx.entries) {
    if (e.active === false) continue;
    const where = seen.get(e.id);
    if (!where) {
      out.push({
        code: "unpaired",
        severity: "error",
        message: `${e.code} is not in this round.`,
        hint: "Add them to a debate or give them a bye.",
        entryIds: [e.id],
      });
    } else if (where.length > 1) {
      out.push({
        code: "double_paired",
        severity: "error",
        message: `${e.code} appears in ${where.length} debates.`,
        entryIds: [e.id],
        pairingKeys: where,
      });
    }
  }
  for (const [id] of seen) {
    const e = entryById.get(id);
    if (e && e.active === false)
      out.push({
        code: "inactive_entry",
        severity: "error",
        message: `${e.code} is dropped but still paired.`,
        entryIds: [id],
      });
  }

  const byes = draft.filter((d) => d.bye || d.entries.length === 1);
  if (kind === "two_team" && byes.length > 1) {
    out.push({
      code: "multiple_byes",
      severity: "warning",
      message: `${byes.length} byes in this round.`,
      pairingKeys: byes.map((b) => b.key),
    });
  }

  const records = kind === "two_team" ? buildRecords(ctx.entries, ctx.results) : null;

  for (const d of draft) {
    if (d.bye || d.entries.length < 2) continue;
    if (kind === "two_team" && records) {
      const [a, b] = d.entries;
      if (a && b) {
        const ea = entryById.get(a.entryId);
        const eb = entryById.get(b.entryId);
        if (
          ea?.schoolId &&
          ea.schoolId === eb?.schoolId &&
          ctx.config?.pairing.avoidSameSchool !== false
        ) {
          out.push({
            code: "same_school",
            severity: "error",
            message: `${ea.code} vs ${eb.code}: same school.`,
            entryIds: [ea.id, eb.id],
            pairingKeys: [d.key],
          });
        }
        if (records.get(a.entryId)?.opponents.includes(b.entryId)) {
          out.push({
            code: "rematch",
            severity: "error",
            message: `${code(a.entryId)} vs ${code(b.entryId)}: rematch.`,
            entryIds: [a.entryId, b.entryId],
            pairingKeys: [d.key],
          });
        }
        if (a.side && b.side && a.side === b.side) {
          out.push({
            code: "same_side",
            severity: "error",
            message: `${code(a.entryId)} and ${code(b.entryId)} are both on the same side.`,
            pairingKeys: [d.key],
          });
        }
        if (ctx.config?.sideMethod === "flip" && ctx.roundSeq % 2 === 0) {
          for (const s of [a, b]) {
            const last = records.get(s.entryId)?.lastSide;
            if (s.side && last && s.side === last) {
              out.push({
                code: "side_lock",
                severity: "warning",
                message: `${code(s.entryId)} is on the same side as last round (side-locked round).`,
                entryIds: [s.entryId],
                pairingKeys: [d.key],
              });
            }
          }
        }
      }
    }

    // Judges.
    const scoring = d.judgeIds.filter((id) => !judgeById.get(id)?.trainee);
    if (scoring.length < ctx.panelSize) {
      out.push({
        code: "underfilled_panel",
        severity: scoring.length === 0 ? "error" : "warning",
        message: `${d.key}: ${scoring.length}/${ctx.panelSize} judges.`,
        pairingKeys: [d.key],
      });
    }
    const entryIds = d.entries.map((e) => e.entryId);
    for (const jid of d.judgeIds) {
      const j = judgeById.get(jid);
      if (!j) continue;
      const elig = judgeEligibility(
        { ...j, available: j.available, hasOutstandingBallot: false, trainee: false },
        entryIds,
        {
          entries: ctx.entries,
          prefs: ctx.prefs,
          settings: ctx.judging,
          softSchoolConflicts: kind === "congress",
        },
        entryById,
      );
      if (!elig.ok) {
        out.push({
          code: "judge_ineligible",
          severity: "error",
          message: `${j.name}: ${elig.reason}.`,
          judgeIds: [jid],
          pairingKeys: [d.key],
        });
      }
      if (ctx.busyJudgeIds?.has(jid)) {
        out.push({
          code: "judge_busy",
          severity: "error",
          message: `${j.name} is judging another event in this timeslot.`,
          judgeIds: [jid],
          pairingKeys: [d.key],
        });
      }
    }

    // Rooms.
    if (!d.roomId) {
      out.push({
        code: "no_room",
        severity: "warning",
        message: `${d.key} has no room.`,
        pairingKeys: [d.key],
      });
    } else {
      const room = roomById.get(d.roomId);
      const needsAccess = entryIds.some((id) => entryById.get(id)?.requiresAccessible);
      if (needsAccess && room && !room.accessible) {
        out.push({
          code: "inaccessible_room",
          severity: "error",
          message: `${d.key} needs an accessible room; ${room.name} is not.`,
          roomIds: [room.id],
          pairingKeys: [d.key],
        });
      }
      if (ctx.busyRoomIds?.has(d.roomId)) {
        out.push({
          code: "room_busy",
          severity: "error",
          message: `${room?.name ?? d.roomId} is used by another event in this timeslot.`,
          roomIds: [d.roomId],
          pairingKeys: [d.key],
        });
      }
    }
  }

  // Double-booked judges / rooms within a flight.
  const byFlight = new Map<number, DraftDebate[]>();
  for (const d of draft) byFlight.set(d.flight, [...(byFlight.get(d.flight) ?? []), d]);
  for (const [flight, ds] of byFlight) {
    const judgeUse = new Map<string, string[]>();
    const roomUse = new Map<string, string[]>();
    for (const d of ds) {
      for (const j of d.judgeIds) judgeUse.set(j, [...(judgeUse.get(j) ?? []), d.key]);
      if (d.roomId) roomUse.set(d.roomId, [...(roomUse.get(d.roomId) ?? []), d.key]);
    }
    for (const [j, keys] of judgeUse) {
      if (keys.length > 1)
        out.push({
          code: "judge_double_booked",
          severity: "error",
          message: `${judgeById.get(j)?.name ?? j} is on ${keys.length} panels in flight ${flight}.`,
          judgeIds: [j],
          pairingKeys: keys,
        });
    }
    for (const [r, keys] of roomUse) {
      if (keys.length > 1)
        out.push({
          code: "room_double_booked",
          severity: "error",
          message: `${roomById.get(r)?.name ?? r} is used by ${keys.length} debates in flight ${flight}.`,
          roomIds: [r],
          pairingKeys: keys,
        });
    }
  }
  return out;
}

export const hasBlockingErrors = (findings: readonly Finding[]): boolean =>
  findings.some((f) => f.severity === "error");
