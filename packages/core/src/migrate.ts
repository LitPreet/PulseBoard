import { migrate } from "drizzle-orm/node-postgres/migrator";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { closeDb, getDb } from "./db";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

const db = getDb();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
await migrate(db as any, { migrationsFolder });
console.log("✔ migrations applied");
await closeDb();
