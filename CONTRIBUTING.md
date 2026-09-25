# Contributing to OpenTab

Thanks for helping! A few guidelines.

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d db && pnpm db:migrate && pnpm db:seed
pnpm dev
```

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e   # if you changed UI flows
```

## Where things go

- **Algorithms** go in `packages/engine`.
  - Keep it pure: no IO, no Date.now in results, and randomness only through `Rng`.
  - Add unit tests, and property tests for invariants.
- **Business rules** go in `packages/core`. Every mutation must:
  1. authorize with `requireRole` or a private-link actor;
  2. validate with Zod;
  3. run in a transaction;
  4. write an audit entry;
  5. emit a realtime event.
- **UI** goes in `apps/web`.
  - Server Actions stay thin and delegate to core.
  - Use the design tokens in `globals.css` and the components in `src/components/ui`.
  - Every page must work at 390px wide and in dark mode, and pass the axe checks.
- **Schema changes.** Edit `packages/db/src/schema.ts`, then run `pnpm db:generate` and commit the generated migration.

## Clean-room policy

Do **not** copy code from Tabroom.com or other projects with incompatible licenses. Describing behaviour ("Tabroom does X when Y") is
fine; copying implementation is not.
