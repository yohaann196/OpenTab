import { runDuePublishes } from "@/lib/queue";

export const dynamic = "force-dynamic";

/** Scheduled-publish sweep for hosts without a worker (e.g. a Vercel Cron Job). */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`)
    return new Response("Unauthorized", { status: 401 });
  return Response.json({ published: await runDuePublishes() });
}
