import { entry, judge, judgePool, type Queryable, room, school } from "@opentab/db";
import { and, eq, inArray } from "drizzle-orm";
import { forbidden } from "./errors";

/**
 * Multi-tenant guard: every id supplied by a client must belong to the
 * tournament the actor is authorized on. Call this after requireRole in any
 * mutation that accepts foreign ids.
 */
export async function assertInTournament(
  db: Queryable,
  tournamentId: string,
  ids: {
    judgeIds?: (string | null | undefined)[];
    entryIds?: (string | null | undefined)[];
    roomIds?: (string | null | undefined)[];
    schoolIds?: (string | null | undefined)[];
    poolIds?: (string | null | undefined)[];
  },
): Promise<void> {
  const check = async (
    table: typeof judge | typeof entry | typeof room | typeof school | typeof judgePool,
    raw: (string | null | undefined)[] | undefined,
  ) => {
    const list = [...new Set((raw ?? []).filter((x): x is string => !!x))];
    if (list.length === 0) return;
    const rows = await db
      .select({ id: table.id })
      .from(table)
      .where(and(inArray(table.id, list), eq(table.tournamentId, tournamentId)));
    if (rows.length !== list.length)
      throw forbidden("That record belongs to a different tournament");
  };
  await check(judge, ids.judgeIds);
  await check(entry, ids.entryIds);
  await check(room, ids.roomIds);
  await check(school, ids.schoolIds);
  await check(judgePool, ids.poolIds);
}
