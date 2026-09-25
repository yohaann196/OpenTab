import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Schema = typeof schema;
/** Driver-agnostic database handle (postgres-js in production, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, Schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything that can run queries: the db or a transaction. */
export type Queryable = Db | Tx;

/**
 * True for transaction-mode poolers (Supabase Supavisor on :6543, Neon
 * `-pooler` hosts, PgBouncer), which don't support prepared statements.
 */
export function isPooledUrl(url: string): boolean {
  if (process.env.DB_POOLED === "1") return true;
  if (process.env.DB_POOLED === "0") return false;
  try {
    const u = new URL(url);
    return u.port === "6543" || u.hostname.includes("-pooler") || u.searchParams.has("pgbouncer");
  } catch {
    return false;
  }
}

/** libpq/Prisma-style params that postgres.js would otherwise forward to the server as settings. */
const CLIENT_ONLY_PARAMS = [
  "channel_binding",
  "pgbouncer",
  "connection_limit",
  "pool_timeout",
  "schema",
];

/** Removes client-only query params that hosted providers add to their connection strings. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of CLIENT_ONLY_PARAMS) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return url;
  }
}

/** Direct (session) connection for migrations and LISTEN; falls back to DATABASE_URL. */
export function directUrl(): string | undefined {
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
}

const serverless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

let cached: { db: Db; sql: postgres.Sql } | undefined;

export function createDb(
  url = process.env.DATABASE_URL,
  opts: { max?: number } = {},
): { db: Db; sql: postgres.Sql } {
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(normalizeUrl(url), {
    max: opts.max ?? Number(process.env.DB_POOL_SIZE ?? (serverless ? 3 : 10)),
    prepare: !isPooledUrl(url),
    idle_timeout: serverless ? 20 : undefined,
    onnotice: () => {},
  });
  return { db: drizzlePg(sql, { schema }) as unknown as Db, sql };
}

/** Process-wide singleton for the web app and worker. */
export function getDb(): Db {
  if (!cached) cached = createDb();
  return cached.db;
}

export function getSql(): postgres.Sql {
  if (!cached) cached = createDb();
  return cached.sql;
}

let listenSql: postgres.Sql | undefined;

/** Single direct connection for LISTEN (poolers in transaction mode can't LISTEN). */
export function getListenSql(): postgres.Sql {
  if (!listenSql) {
    const url = directUrl();
    if (!url) throw new Error("DATABASE_URL is not set");
    listenSql = postgres(normalizeUrl(url), { max: 1, prepare: false, onnotice: () => {} });
  }
  return listenSql;
}
