# OpenTab

**Modern, open-source tabulation for speech & debate tournaments** — Policy, Lincoln–Douglas, Public Forum, Congress and World
Schools.

OpenTab covers the core of running a debate tournament. Tab directors set up in minutes and pair a round in one click. Judges submit
ballots from their phones without an account. Competitors get live pairings and push notifications. It is built to stay up on the
busiest Saturday of the season.

> OpenTab is an independent project and is not affiliated with the NSDA or Tabroom.com. No Tabroom code is used: Tabroom is licensed
> RPL-1.5, and OpenTab is a clean-room implementation.

## Why

Tabroom.com runs most US high-school and college tournaments, but it is a 15-year-old Perl/Mason app. Its well-known pain points
shaped OpenTab's design:

| Pain point | OpenTab's answer |
| --- | --- |
| Outages and slowdowns on tournament Saturdays | Published rounds are frozen **snapshots** served through ISR/CDN caching. Live updates arrive over **one SSE connection per device** (Postgres `LISTEN/NOTIFY`) instead of refresh storms. Reconnects are jittered. |
| Text blasts no longer arrive (carrier email-to-SMS gateways are shutting down) | **Web Push** (VAPID) plus email, sent from a Postgres-backed job queue (pg-boss). |
| "Please use a laptop for your ballot" | **Phone-first ballots**: steppers, live totals, inline validation, a review screen, **local autosave and an offline retry queue**. |
| Judges locked out by account linking | **Private links / QR cards** per judge and entry. No account is needed. |
| Can't finish the RFD between rounds | **Decision now, RFD later**: the RFD stays editable for a configurable grace period. |
| Walking to the tab room to fix a ballot | **Correction requests** go straight to the live ballot board. |
| Hundreds of opaque settings | **Format presets** plus a settings editor where every option explains itself. |
| Black-box pairings | Every debate carries a **"why this pairing?"** cost breakdown, and every standing says which tiebreak decided it. |
| No public API, so a scraper ecosystem | A documented **public JSON API** (OpenAPI 3.1), plus CSV and full JSON exports. |
| Minors' names on the open web | **Codes-only** mode, per-competitor hiding, and revocable links. |

## What's in the box

- **Tab room.** A 2-minute setup wizard, then:
  - CSV import with automatic column mapping, preview and per-row errors;
  - data grids for schools, entries, judges, rooms and conflicts;
  - a **drag-and-drop draw editor** with live pre-publish checks, locks, flights, history and undo;
  - scheduled publishing;
  - a live ballot board with paper entry;
  - standings with tiebreak explanations, the break, visual brackets, private-link management, QR cards and an audit log;
  - a ⌘K command palette.
- **Judges.** A portal with the current room, online link, motion and "I'm in the room". Ballots for two-team formats, World Schools
  (style/content/strategy plus reply) and Congress (per-speech points, ranks, PO). A chamber tracker with a precedence/recency queue.
- **Competitors and coaches.** "Find my round" search, live pairings, push/email follows, drag-to-rank pref sheets (ordinal or
  tiers, with strikes), and released ballots and RFDs.
- **Public site.** Tournament directory, live pairings, results and brackets, and a judge paradigm search.
- **Engine.** A pure, deterministic TypeScript package:
  - Edmonds blossom min-cost perfect matching for pairings;
  - min-cost flow for judge panels and flights;
  - Hungarian assignment for rooms;
  - MPJ normalisation, a tiebreak ranker with explanations, and Congress chambers and standings;
  - elim brackets and round robins.

## Architecture

```
apps/web          Next.js 16 (App Router) — landing, public site, portals, tab room, API, SSE
apps/worker       pg-boss consumer — Web Push / email fan-out, ballot reminders, scheduled publishes
packages/engine   Pure TypeScript tab engine (no IO): pairing, allocation, standings, elims, validation
packages/db       Postgres schema (Drizzle ORM) + migrations; PGlite for hermetic tests
packages/core     Domain services: authorization, audit log, realtime events, snapshots, use-cases
e2e               Playwright end-to-end and accessibility tests
```

See [`docs/architecture.md`](docs/architecture.md) for the data model, the pairing formulation and the scaling design.

## Quick start

Requirements: Node 22+, pnpm 10, and Postgres 16 (or Docker).

```bash
pnpm install
cp .env.example .env              # set BETTER_AUTH_SECRET; DATABASE_URL defaults to localhost
docker compose up -d db           # or use your own Postgres 16
pnpm db:migrate
pnpm db:seed                      # optional demo tournament
pnpm dev                          # web on :3000 + worker
```

The seed creates **OpenTab Invitational**, an in-progress demo with LD, PF, Policy, Congress and World Schools:

- public site: `/t/opentab-invitational`
- tab room: `/tab/opentab-invitational`, signing in as `demo@opentab.dev` / `opentab-demo`
- the seed prints private judge and entry links

Optional settings:

- `SMTP_URL`, for email;
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`, for Web Push. Generate them with `pnpm --filter @opentab/worker vapid`.

### Deploying to Vercel (free, one GitHub login)

Follow [docs/deploy-vercel.md](docs/deploy-vercel.md). It covers Vercel plus a Postgres database from Neon (created inside Vercel)
or Supabase, and serving at a sub-path such as `yourdomain.com/opentab`. Serverless hosts run jobs inline and poll for live
updates. They need no worker process.

### Self-hosting with Docker

```bash
docker compose up -d   # postgres + web (runs migrations on start) + worker
```

For large tournaments, put a CDN in front of `/t/*`, `/api/v1/public/*` and static assets. Public pages send cache headers.

## Development

```bash
pnpm lint         # Biome
pnpm typecheck    # all packages
pnpm test         # engine unit + property tests, core integration tests (PGlite)
pnpm bench        # pairing + judge + room placement benchmark
pnpm e2e          # Playwright (needs a running Postgres; seeds are optional)
```

Measured in the development container (single Node process):

| Check | Result |
| --- | --- |
| Engine (pair + judges + rooms per round) | 100 entries ≈ 0.1 s, 300 entries ≈ 0.6 s, 500 entries ≈ 3 s |
| Public pairings page (`next start`, 100 concurrent clients) | ~690 req/s, p99 256 ms, 0 errors |
| Live updates | 500 concurrent SSE clients received a publish event in p99 29 ms |

## Public API

The API is read-only and CORS-open. Responses are cacheable and rate-limited. The OpenAPI document is at `/api/v1/openapi.json`.

```
GET /api/v1/public/tournaments?q=
GET /api/v1/public/t/{slug}
GET /api/v1/public/t/{slug}/rounds/{roundId}
GET /api/v1/public/t/{slug}/events/{eventId}/standings
GET /api/v1/public/t/{slug}/events/{eventId}/bracket
GET /api/v1/public/t/{slug}/find?q=
```

## License

[GNU AGPL v3](LICENSE). If you run a modified OpenTab as a service, you must share your changes.
