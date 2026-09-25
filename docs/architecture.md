# OpenTab architecture

## Layers

```
┌──────────────────────────── apps/web (Next.js) ─────────────────────────────┐
│ Marketing (static)   Public site (ISR)   Portals (/p/token)   Tab room      │
│ Server Actions ──────────────┐   Route handlers: public API, SSE, exports   │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               ▼
┌──────────────────── packages/core (domain services) ───────────────────────┐
│ authorize (requireRole / private-link actor) → validate (Zod) → transaction │
│ → audit log → pg_notify realtime event → enqueue jobs                       │
└───────────────┬──────────────────────────────────┬──────────────────────────┘
                ▼                                  ▼
┌──── packages/engine (pure) ────┐      ┌──── packages/db (Postgres) ────────┐
│ pairing · allocation · tiebreak│      │ Drizzle schema, migrations, PGlite │
│ elims · congress · validation  │      └────────────────────────────────────┘
└────────────────────────────────┘
apps/worker: pg-boss consumers (push/email fan-out, reminders, scheduled publish)
```

- **The engine never touches IO.** Loaders in `packages/core/src/loaders.ts` map database rows into plain engine types, so every
  algorithm is unit- and property-tested in isolation.
- **Every mutation follows one path:** authorize, validate, run a transaction, write the audit log, then emit a realtime event. The
  web app's Server Actions are thin wrappers over these services, and so are private-link actions and the worker.
- **Tenant isolation.** Any client-supplied id (judge, entry, room, school, pool, audit entry, link subject) is checked with
  `assertInTournament` after `requireRole`. A tabber on one tournament can never read or change another's data. A dedicated test
  suite covers this.

## Data model highlights

- **Typed configuration.** Each event has one JSONB `config`, validated by a Zod union discriminated on format. This replaces the
  dozens of untyped `*_setting` key/value tables found in legacy systems.
- **Pairings.**
  - `round` holds status (`draft | published | completed`) and a version number.
  - `pairing` holds room, flight, bracket, bye, lock, coin-flip flag, elim slot and chamber label.
  - `pairing_entry` holds side and position; `pairing_judge` holds role.
- **Ballots.**
  - One `ballot` per scoring judge per pairing, with status `pending | draft | submitted | confirmed`.
  - Each ballot also carries an RFD grace deadline, a correction request, and started/accepted timestamps.
  - Two-team speaker points live in `speaker_score` (with WSDC components). Congress ballots store speeches, ranks and PO points in
    JSONB.
- **Snapshots.** `published_snapshot` stores frozen JSON views (pairings, standings, bracket). Public pages and the public API read
  only these.
- **Private links.** `access_token` stores random 144-bit tokens for judges and entries. They can be rotated or revoked.
- **Audit.** `audit_log` records every tab change with before/after JSON. Draw edits can be reverted from it.

## Pairing as one optimization

Two-team rounds are solved as a **minimum-cost perfect matching** on the complete graph of entries, using Edmonds' blossom
algorithm in O(n³):

1. **Order and bye.** Order entries by record, then the configured in-bracket metric (points, SOP or opponent wins). If the field is
   odd, assign the bye by policy; nobody gets a repeat bye.
2. **Resolve odd brackets.** Pull up an entry from the next bracket, top-down. The rule is configurable (top, bottom or random), and
   entries with no legal opponent in the upper bracket are skipped.
3. **Score every pair.** Each pair's cost is the sum of named, weighted terms:

   | Term | Default weight | Meaning |
   | --- | --- | --- |
   | rematch | 50,000,000 | already met (effectively hard) |
   | same school | 10,000,000 | effectively hard |
   | side lock | 5,000,000 | both side-locked to the same side in a flip round |
   | bracket gap | 1,000,000 × gap² | different effective brackets |
   | side conflict | 20,000 × due | both due the same side in balance rounds |
   | position | 10 × deviation² | distance from the ideal high–low / high–high opponent |

4. **Solve and assign sides.** Solve the matching, assign sides (flip, balance or coin flip), and keep each pair's terms as its
   explanation.

Because the matching is global, a constraint conflict in one bracket is fixed with the smallest total disruption, instead of
cascading through bracket-by-bracket backtracking.

**Judges** are placed with a **min-cost max-flow**:

```
source → judge (cap = flights) → judge@flight (cap 1) → panel (cost) → sink (cap = panel size)
```

- Hard constraints remove edges: conflicts, strikes, same school, unavailability, owing a ballot, and trainees.
- Soft terms become edge costs: mutual preference (worst pref plus mutuality), pref ceiling, tab rating weighted by debate
  importance, obligation balance, and repeat judging.

**Rooms** use the Hungarian algorithm per flight. Accessibility and capacity are hard constraints. Priority rooms go to important
debates, and preferred rooms keep flights and Congress chambers stable.

## Scaling design

- **Snapshots plus ISR.** Public pages render once, then serve from cache (15–60 s, and invalidated on publish). The API sends
  `s-maxage` and `stale-while-revalidate`, so a CDN absorbs peak traffic.
- **One `LISTEN` per process.** The realtime hub keeps a single Postgres connection and fans events out to every SSE client. Clients
  reconnect with a jittered `retry:` delay and debounce refreshes with jitter, which avoids thundering herds after a deploy.
- **Background delivery.** Publishing enqueues a job; the worker sends notifications with bounded concurrency and removes dead push
  subscriptions. Handlers live in `packages/core/src/delivery.ts`, so they can run in the worker or inline.
- **Serverless mode** (Vercel, `LIVE_MODE=poll`, `JOB_MODE=inline`):
  - `emit()` also bumps a per-tournament `live_cursor`, and clients poll an edge-cached `/api/t/:slug/pulse` in place of SSE;
  - jobs run in-process through `after()`;
  - scheduled publishes are claimed atomically by a throttled sweep (`publishDueRounds`) plus a cron endpoint.
- **Rate limits.** Public endpoints have a per-IP limiter. Put a CDN/WAF in front for fleet-wide limits.

## Testing

| Layer | Tooling | Coverage |
| --- | --- | --- |
| Engine | Vitest + fast-check | Blossom matched against brute force; pairing invariants on random fields (everyone paired once, determinism, no avoidable same-school or rematches, side balance); allocation, standings, elims, ballots, checks |
| Core | Vitest on PGlite (in-memory Postgres) | A full tournament run: CSV import, four prelims with private-link ballots, draw edits, checks, break to champion, prefs, notifications and Congress |
| Web | Playwright | Sign-up → wizard → imports → pairing → publish → judge phone ballot → live board → public site and API. Also the draw-editor swap and undo, and axe WCAG 2.2 AA checks |
