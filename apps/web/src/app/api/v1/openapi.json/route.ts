import { env } from "@/lib/env";

/** OpenAPI 3.1 description of the public, read-only API. */
export function GET() {
  const idParam = (name: string, desc: string) => ({
    name,
    in: "path",
    required: true,
    description: desc,
    schema: { type: "string" },
  });
  const ok = (desc: string) => ({
    "200": { description: desc, content: { "application/json": { schema: { type: "object" } } } },
    "404": { description: "Not found" },
    "429": { description: "Rate limited" },
  });
  const spec = {
    openapi: "3.1.0",
    info: {
      title: "OpenTab public API",
      version: "1.0.0",
      description:
        "Read-only access to published tournament data: pairings, standings and brackets. Responses are cacheable; please respect Cache-Control and keep to a few requests per second.",
      license: { name: "AGPL-3.0-only" },
    },
    servers: [{ url: `${env.appUrl}/api/v1/public` }],
    paths: {
      "/tournaments": {
        get: {
          summary: "List public tournaments",
          parameters: [{ name: "q", in: "query", schema: { type: "string" } }],
          responses: ok("Tournaments"),
        },
      },
      "/t/{slug}": {
        get: {
          summary: "Tournament, events and published rounds",
          parameters: [idParam("slug", "Tournament URL slug")],
          responses: ok("Tournament"),
        },
      },
      "/t/{slug}/rounds/{roundId}": {
        get: {
          summary: "Published pairings for a round",
          parameters: [idParam("slug", "Tournament slug"), idParam("roundId", "Round id")],
          responses: ok("Pairings snapshot"),
        },
      },
      "/t/{slug}/events/{eventId}/standings": {
        get: {
          summary: "Published standings for an event",
          parameters: [idParam("slug", "Tournament slug"), idParam("eventId", "Event id")],
          responses: ok("Standings"),
        },
      },
      "/t/{slug}/events/{eventId}/bracket": {
        get: {
          summary: "Published elimination bracket",
          parameters: [idParam("slug", "Tournament slug"), idParam("eventId", "Event id")],
          responses: ok("Bracket"),
        },
      },
      "/t/{slug}/find": {
        get: {
          summary: "Search current pairings by name, code, school or judge",
          parameters: [
            idParam("slug", "Tournament slug"),
            { name: "q", in: "query", required: true, schema: { type: "string", minLength: 2 } },
          ],
          responses: ok("Matches"),
        },
      },
    },
  };
  return Response.json(spec, {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" },
  });
}
