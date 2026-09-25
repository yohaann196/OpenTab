# syntax=docker/dockerfile:1.7
# Multi-stage build for the OpenTab web app and worker.
FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/engine/package.json packages/engine/
COPY packages/db/package.json packages/db/
COPY packages/core/package.json packages/core/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @opentab/web build

# Web: runs migrations on start, then serves Next.js.
FROM base AS web
ENV NODE_ENV=production PORT=3000
COPY --from=build /app /app
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm --filter @opentab/web start"]

# Worker: notifications, reminders and scheduled publishes.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=build /app /app
CMD ["pnpm", "--filter", "@opentab/worker", "start"]
