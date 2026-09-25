# OpenTab

Modern, open-source tabulation for speech & debate tournaments — Policy, Lincoln–Douglas, Public
Forum, Congress and World Schools.

> Work in progress. See `docs/` (coming soon) for the architecture and the tab director guide.

```
apps/web          Next.js app: landing page, public postings, judge/entry portals, tab room
apps/worker       Background jobs: notifications, scheduled publishes
packages/engine   Pure TypeScript tab engine: pairing, judge/room placement, tiebreaks, elims
packages/db       Postgres schema (Drizzle) and migrations
packages/core     Domain services shared by web and worker
```

## Development

```bash
pnpm install
pnpm test        # engine unit + property tests
pnpm bench       # pairing benchmark
```

Licensed under the GNU AGPL v3.
