import { drizzle } from "drizzle-orm/node-postgres";
import type { SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import pg from "pg";
import * as schema from "./schema";

/** Works with both node-postgres (prod) and PGlite (tests). */
export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

const globalForDb = globalThis as unknown as { __pbPool?: pg.Pool; __pbDb?: DB };

export function getDb(): DB {
  if (globalForDb.__pbDb) return globalForDb.__pbDb;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_SIZE ?? 10) });
  globalForDb.__pbPool = pool;
  globalForDb.__pbDb = drizzle(pool, { schema }) as unknown as DB;
  return globalForDb.__pbDb;
}

export async function closeDb() {
  await globalForDb.__pbPool?.end();
  globalForDb.__pbPool = undefined;
  globalForDb.__pbDb = undefined;
}

/** Run a raw SQL query and return its rows, regardless of driver. */
export async function rows<T>(db: DB, query: SQL): Promise<T[]> {
  const res = (await db.execute(query)) as unknown as { rows: T[] };
  return res.rows;
}
