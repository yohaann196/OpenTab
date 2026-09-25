import {
  addFollow,
  getTournamentBySlug,
  removeFollowByToken,
  removeFollowsByEndpoint,
} from "@opentab/core";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const body = z.object({
  slug: z.string(),
  targetType: z.enum(["entry", "judge", "school", "tournament"]),
  targetId: z.uuid(),
  channel: z.enum(["push", "email"]),
  endpoint: z.string().min(3).max(2000),
  keys: z.object({ p256dh: z.string(), auth: z.string() }).nullable().optional(),
});

/** Follow an entry/judge/school/tournament via Web Push or email. */
export async function POST(req: Request) {
  if (!rateLimit(req, "follow", 30))
    return Response.json({ error: "Too many requests" }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const t = await getTournamentBySlug(db(), parsed.data.slug);
  if (!t) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const { slug: _slug, ...rest } = parsed.data;
    const f = await addFollow(db(), t.id, rest);
    return Response.json({ ok: true, unsubscribe: f.unsubscribeToken });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Couldn't follow" },
      { status: 400 },
    );
  }
}

/** Unfollow by unsubscribe token (from an email link) or by push endpoint. */
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const endpoint = url.searchParams.get("endpoint");
  if (token) return Response.json({ ok: await removeFollowByToken(db(), token) });
  if (endpoint) {
    await removeFollowsByEndpoint(db(), endpoint);
    return Response.json({ ok: true });
  }
  return Response.json({ error: "Missing token" }, { status: 400 });
}
