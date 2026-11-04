import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "../src/schema";
import type { DB } from "../src/db";

const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "drizzle");

/** Fresh in-memory Postgres with all migrations applied. */
export async function createTestDb(): Promise<{ db: DB; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as DB, close: () => client.close() };
}

export async function createProject(db: DB, name = "Test") {
  const [org] = await db.insert(schema.organizations).values({ name: "Org" }).returning();
  const [project] = await db
    .insert(schema.projects)
    .values({ orgId: org!.id, name, publicKey: `pk_test_${Math.random().toString(36).slice(2)}` })
    .returning();
  return project!;
}
