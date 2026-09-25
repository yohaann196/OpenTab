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

let cached: { db: Db; sql: postgres.Sql } | undefined;

export function createDb(url = process.env.DATABASE_URL): { db: Db; sql: postgres.Sql } {
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: Number(process.env.DB_POOL_SIZE ?? 10), onnotice: () => {} });
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
