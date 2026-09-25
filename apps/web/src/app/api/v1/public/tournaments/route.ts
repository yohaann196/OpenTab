import { listPublicTournaments } from "@opentab/core";
import { db } from "@/lib/db";
import { json, limited } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const l = limited(req);
  if (l) return l;
  const q = new URL(req.url).searchParams.get("q") ?? undefined;
  return json(
    { tournaments: await listPublicTournaments(db(), { q, limit: 100 }) },
    { maxAge: 60 },
  );
}
