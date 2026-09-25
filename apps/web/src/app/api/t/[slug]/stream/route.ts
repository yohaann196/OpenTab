import { getTournamentBySlug } from "@opentab/core";
import { db } from "@/lib/db";
import { hub } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Server-Sent Events: live pairings, ballots and standings for one tournament. */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getTournamentBySlug(db(), slug);
  if (!t || t.visibility === "private") return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    async start(controller) {
      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      // Jittered reconnect delay spreads reconnect storms after a deploy/outage.
      send(`retry: ${3000 + Math.floor(Math.random() * 7000)}\n\n`);
      send(`event: hello\ndata: ${JSON.stringify({ tournamentId: t.id })}\n\n`);
      const unsubscribe = await hub.subscribe(t.id, (e) =>
        send(`event: update\ndata: ${JSON.stringify(e)}\n\n`),
      );
      const heartbeat = setInterval(() => send(": ping\n\n"), 25_000);
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.signal.addEventListener("abort", () => {
        cleanup();
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
