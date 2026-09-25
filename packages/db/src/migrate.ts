import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb } from "./client";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

const { db, sql } = createDb();
// biome-ignore lint/suspicious/noExplicitAny: migrator expects the concrete driver type
await migrate(db as any, { migrationsFolder });
await sql.end();
console.log("Migrations applied.");
