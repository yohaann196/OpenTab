import { solveAssignment } from "../optim/hungarian";
import type { Finding, RoomInfo } from "../types";

/**
 * Room allocation per flight (Hungarian algorithm). The most important
 * debates get the highest-priority rooms; accessibility and capacity are hard
 * constraints; a preferred room (e.g. the judge's flight-A room, or a Congress
 * chamber's previous room) is strongly favoured.
 */
export interface RoomRequest {
  key: string;
  label?: string;
  flight: number;
  /** 0–1; higher gets better rooms. */
  importance: number;
  requiresAccessible?: boolean;
  people?: number;
  preferredRoomId?: string | null;
}

export interface RoomAllocationOutput {
  assignments: Map<string, string | null>;
  findings: Finding[];
}

export function allocateRooms(
  requests: readonly RoomRequest[],
  rooms: readonly RoomInfo[],
): RoomAllocationOutput {
  const available = rooms.filter((r) => r.available !== false);
  const maxPriority = Math.max(1, ...available.map((r) => r.priority ?? 0));
  const assignments = new Map<string, string | null>();
  const findings: Finding[] = [];
  const flights = [...new Set(requests.map((r) => r.flight))];

  for (const f of flights) {
    const reqs = requests.filter((r) => r.flight === f);
    if (available.length === 0) {
      for (const r of reqs) assignments.set(r.key, null);
      continue;
    }
    const cost = reqs.map((req) =>
      available.map((room) => {
        if (req.requiresAccessible && !room.accessible) return Number.POSITIVE_INFINITY;
        if (req.people && room.capacity != null && room.capacity < req.people)
          return Number.POSITIVE_INFINITY;
        const prio = room.priority ?? 0;
        let c = Math.round(req.importance * 100) * (maxPriority - prio) + (maxPriority - prio);
        // Keep accessible rooms free for those who need them.
        if (room.accessible && !req.requiresAccessible) c += 5;
        if (req.preferredRoomId && req.preferredRoomId === room.id) c -= 1_000_000;
        return c;
      }),
    );
    const res = solveAssignment(cost);
    reqs.forEach((req, i) => {
      const col = res[i] ?? -1;
      const room = col >= 0 ? available[col]! : null;
      assignments.set(req.key, room?.id ?? null);
      if (!room) {
        findings.push({
          code: req.requiresAccessible ? "no_accessible_room" : "no_room",
          severity: "error",
          message: req.requiresAccessible
            ? `No accessible room available for ${req.label ?? req.key} (flight ${f}).`
            : `No room available for ${req.label ?? req.key} (flight ${f}).`,
          hint: "Add rooms or free up a room from another event.",
          pairingKeys: [req.key],
        });
      }
    });
  }
  return { assignments, findings };
}
