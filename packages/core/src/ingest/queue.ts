import type { Redis } from "ioredis";
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { getRedis, STREAM_KEY } from "../redis";
import { projects } from "../schema";
import type { QueuedEvent } from "./payload";

const KEY_CACHE_TTL_S = 60;
const STREAM_MAXLEN = 1_000_000;

const keyCacheKey = (publicKey: string) => `pb:pk:${publicKey}`;

/** Look up a project id by public key, with a short Redis cache (negative results cached too). */
export async function resolveProjectKey(db: DB, redis: Redis, publicKey: string): Promise<string | null> {
  if (!/^pk_[a-z0-9_]{8,80}$/i.test(publicKey)) return null;
  const cached = await redis.get(keyCacheKey(publicKey));
  if (cached !== null) return cached === "" ? null : cached;
  const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.publicKey, publicKey)).limit(1);
  await redis.set(keyCacheKey(publicKey), row?.id ?? "", "EX", KEY_CACHE_TTL_S);
  return row?.id ?? null;
}

export async function invalidateProjectKeyCache(publicKey: string) {
  await getRedis().del(keyCacheKey(publicKey));
}

/**
 * Fixed one-second window rate limit per project.
 * Returns false when the project has exceeded `limit` events in the current second.
 */
export async function checkRateLimit(redis: Redis, projectId: string, count: number, limit: number): Promise<boolean> {
  const key = `pb:rl:${projectId}:${Math.floor(Date.now() / 1000)}`;
  const [[, total]] = (await redis.multi().incrby(key, count).expire(key, 2).exec()) as [[unknown, number]];
  return total <= limit;
}

/** Append a batch of events to the ingestion stream as a single entry. */
export async function enqueueEvents(redis: Redis, events: QueuedEvent[]) {
  if (events.length === 0) return;
  await redis.xadd(STREAM_KEY, "MAXLEN", "~", STREAM_MAXLEN, "*", "d", JSON.stringify(events));
}
