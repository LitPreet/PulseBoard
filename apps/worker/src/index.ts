import { hostname } from "node:os";
import { closeDb, getDb } from "@pulseboard/core/db";
import { processEvents, type ProcessedEvent, type QueuedEvent } from "@pulseboard/core/ingest";
import { CONSUMER_GROUP, createRedis, liveChannel, STREAM_KEY } from "@pulseboard/core/redis";

const CONSUMER = process.env.WORKER_ID ?? `${hostname()}-${process.pid}`;
const READ_COUNT = Number(process.env.WORKER_READ_COUNT ?? 200);
const BLOCK_MS = 5_000;
const RECLAIM_IDLE_MS = 60_000;
const RECLAIM_EVERY_MS = 30_000;
const MAX_ATTEMPTS = 5;
const DEAD_LETTER_KEY = `${STREAM_KEY}:dead`;

type Entry = [id: string, fields: string[]];

const redis = createRedis();
const publisher = createRedis();
const db = getDb();
const attempts = new Map<string, number>();
let running = true;
let processedTotal = 0;

const log = (msg: string, extra?: unknown) =>
  console.log(`[worker ${new Date().toISOString()}] ${msg}`, extra === undefined ? "" : extra);

async function ensureGroup() {
  try {
    await redis.xgroup("CREATE", STREAM_KEY, CONSUMER_GROUP, "0", "MKSTREAM");
    log(`created consumer group "${CONSUMER_GROUP}"`);
  } catch (err) {
    if (!String(err).includes("BUSYGROUP")) throw err;
  }
}

function decode(entry: Entry): QueuedEvent[] {
  const fields = entry[1];
  const idx = fields.indexOf("d");
  if (idx === -1) return [];
  return JSON.parse(fields[idx + 1]!) as QueuedEvent[];
}

async function publishLive(events: ProcessedEvent[]) {
  const byProject = new Map<string, ProcessedEvent[]>();
  for (const e of events) byProject.set(e.projectId, [...(byProject.get(e.projectId) ?? []), e]);
  const pipeline = publisher.pipeline();
  for (const [projectId, evs] of byProject) {
    const compact = evs.slice(-100).map((e) => ({
      id: e.id,
      event: e.event,
      distinctId: e.distinctId,
      personId: e.personId,
      sessionId: e.sessionId,
      timestamp: e.timestamp.toISOString(),
      properties: e.properties,
    }));
    pipeline.publish(liveChannel(projectId), JSON.stringify(compact));
  }
  await pipeline.exec();
}

async function handle(entries: Entry[]) {
  if (entries.length === 0) return;
  const started = performance.now();
  try {
    const processed = await processEvents(db, entries.flatMap(decode));
    await redis.xack(STREAM_KEY, CONSUMER_GROUP, ...entries.map((e) => e[0]));
    for (const e of entries) attempts.delete(e[0]);
    processedTotal += processed.length;
    if (processed.length) await publishLive(processed).catch((err) => log("live publish failed", err));
    log(`stored ${processed.length} events from ${entries.length} entries in ${Math.round(performance.now() - started)}ms`);
  } catch (err) {
    if (entries.length > 1) {
      // Isolate the bad entry so one poison message can't block the rest of the batch.
      log(`batch failed, retrying ${entries.length} entries individually`, String(err));
      for (const entry of entries) await handle([entry]);
      return;
    }
    const entry = entries[0]!;
    const n = (attempts.get(entry[0]) ?? 0) + 1;
    attempts.set(entry[0], n);
    log(`entry ${entry[0]} failed (attempt ${n}/${MAX_ATTEMPTS})`, String(err));
    if (n >= MAX_ATTEMPTS) {
      await redis.xadd(DEAD_LETTER_KEY, "*", ...entry[1], "error", String(err));
      await redis.xack(STREAM_KEY, CONSUMER_GROUP, entry[0]);
      attempts.delete(entry[0]);
      log(`entry ${entry[0]} moved to ${DEAD_LETTER_KEY}`);
    }
  }
}

/** Take over messages another (crashed) consumer read but never acknowledged. */
async function reclaim() {
  let cursor = "0-0";
  do {
    const res = (await redis.xautoclaim(STREAM_KEY, CONSUMER_GROUP, CONSUMER, RECLAIM_IDLE_MS, cursor, "COUNT", 100)) as [
      string,
      Entry[],
    ];
    cursor = res[0];
    const entries = res[1].filter((e) => e[1] !== null);
    if (entries.length) {
      log(`reclaimed ${entries.length} pending entries`);
      await handle(entries);
    }
  } while (cursor !== "0-0" && running);
}

async function main() {
  await ensureGroup();
  log(`consumer "${CONSUMER}" listening on ${STREAM_KEY}`);
  let lastReclaim = 0;
  while (running) {
    try {
      if (Date.now() - lastReclaim > RECLAIM_EVERY_MS) {
        lastReclaim = Date.now();
        await reclaim();
      }
      const res = (await redis.xreadgroup(
        "GROUP",
        CONSUMER_GROUP,
        CONSUMER,
        "COUNT",
        READ_COUNT,
        "BLOCK",
        BLOCK_MS,
        "STREAMS",
        STREAM_KEY,
        ">",
      )) as [string, Entry[]][] | null;
      if (res?.[0]) await handle(res[0][1]);
    } catch (err) {
      if (!running) break;
      log("loop error, backing off", String(err));
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function shutdown(signal: string) {
  if (!running) return;
  running = false;
  log(`${signal} received, shutting down (processed ${processedTotal} events this run)`);
  redis.disconnect();
  publisher.disconnect();
  await closeDb();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
