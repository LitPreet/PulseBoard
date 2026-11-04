import { Redis } from "ioredis";

export const STREAM_KEY = "pb:events";
export const CONSUMER_GROUP = "ingest";
export const liveChannel = (projectId: string) => `pb:live:${projectId}`;

const globalForRedis = globalThis as unknown as { __pbRedis?: Redis };

/** Shared command connection. Subscribers must create their own via `createRedis()`. */
export function getRedis(): Redis {
  if (!globalForRedis.__pbRedis) globalForRedis.__pbRedis = createRedis();
  return globalForRedis.__pbRedis;
}

export function createRedis(): Redis {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    enableAutoPipelining: true,
  });
}
