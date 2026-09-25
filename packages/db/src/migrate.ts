import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, directUrl } from "./client";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

// Migrations need a session connection (not a transaction-mode pooler).
const { db, sql } = createDb(directUrl(), { max: 1 });
// biome-ignore lint/suspicious/noExplicitAny: migrator expects the concrete driver type
await migrate(db as any, { migrationsFolder });
await sql.end();
console.log("Migrations applied.");
