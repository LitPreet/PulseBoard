import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "../db";
import { eventDefinitions, events, personDistinctIds, persons, sessions } from "../schema";
import type { QueuedEvent } from "./payload";
import { parseUserAgent } from "./ua";

export interface ProcessedEvent {
  id: string;
  projectId: string;
  event: string;
  distinctId: string;
  personId: string;
  sessionId: string | null;
  timestamp: Date;
  properties: Record<string, unknown>;
}

const INSERT_CHUNK = 500;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : null);

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Persist a batch of queued events. Idempotent: events are keyed by their client UUID,
 * and session/definition counters only move for rows that were actually inserted.
 */
export async function processEvents(db: DB, input: QueuedEvent[]): Promise<ProcessedEvent[]> {
  if (input.length === 0) return [];
  const sorted = [...input].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const byProject = new Map<string, QueuedEvent[]>();
  const seen = new Set<string>();
  for (const e of sorted) {
    if (seen.has(e.uuid)) continue;
    seen.add(e.uuid);
    const list = byProject.get(e.projectId) ?? [];
    list.push(e);
    byProject.set(e.projectId, list);
  }
  const out: ProcessedEvent[] = [];
  for (const [projectId, evs] of byProject) {
    out.push(...(await db.transaction((tx) => processProject(tx as unknown as DB, projectId, evs))));
  }
  return out;
}

async function processProject(db: DB, projectId: string, evs: QueuedEvent[]): Promise<ProcessedEvent[]> {
  // 1. Identity merges must happen before we resolve person ids for the batch.
  for (const e of evs) {
    if (e.event !== "$identify") continue;
    const anon = str(e.properties.$anon_distinct_id);
    if (anon && anon !== e.distinctId) await mergeIdentity(db, projectId, e.distinctId, anon, new Date(e.timestamp));
  }

  // 2. Resolve (or create) a person for every distinct id in the batch.
  const firstSeen = new Map<string, Date>();
  for (const e of evs) if (!firstSeen.has(e.distinctId)) firstSeen.set(e.distinctId, new Date(e.timestamp));
  const personOf = await resolvePersons(db, projectId, firstSeen);

  // 3. Person properties ($set / $set_once) and first/last seen.
  await updatePersons(db, evs, personOf);

  // 4. Enrich + insert events.
  const prepared: ProcessedEvent[] = evs.map((e) => {
    const properties = { ...e.properties };
    if (e.userAgent && properties.$browser === undefined) {
      const ua = parseUserAgent(e.userAgent);
      if (ua.browser) properties.$browser = ua.browser;
      if (ua.os) properties.$os = ua.os;
      if (ua.deviceType) properties.$device_type = ua.deviceType;
    }
    return {
      id: e.uuid,
      projectId,
      event: e.event,
      distinctId: e.distinctId,
      personId: personOf.get(e.distinctId)!,
      sessionId: e.sessionId,
      timestamp: new Date(e.timestamp),
      properties,
    };
  });

  const inserted = new Set<string>();
  for (const part of chunk(prepared, INSERT_CHUNK)) {
    const rows = await db.insert(events).values(part).onConflictDoNothing().returning({ id: events.id });
    for (const r of rows) inserted.add(r.id);
  }
  const fresh = prepared.filter((e) => inserted.has(e.id));
  if (fresh.length === 0) return [];

  // 5. Session rollups + 6. event definitions — only for newly inserted rows.
  await upsertSessions(db, projectId, fresh);
  await upsertDefinitions(db, projectId, fresh);
  return fresh;
}

async function lookupPersons(db: DB, projectId: string, distinctIds: string[]) {
  const map = new Map<string, string>();
  for (const part of chunk(distinctIds, 1000)) {
    const rows = await db
      .select({ distinctId: personDistinctIds.distinctId, personId: personDistinctIds.personId })
      .from(personDistinctIds)
      .where(and(eq(personDistinctIds.projectId, projectId), inArray(personDistinctIds.distinctId, part)));
    for (const r of rows) map.set(r.distinctId, r.personId);
  }
  return map;
}

async function resolvePersons(db: DB, projectId: string, firstSeen: Map<string, Date>) {
  const ids = [...firstSeen.keys()];
  const found = await lookupPersons(db, projectId, ids);
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length === 0) return found;

  const created = missing.map((distinctId) => ({ distinctId, personId: crypto.randomUUID() }));
  for (const part of chunk(created, INSERT_CHUNK)) {
    await db.insert(persons).values(
      part.map((c) => ({
        id: c.personId,
        projectId,
        firstSeen: firstSeen.get(c.distinctId)!,
        lastSeen: firstSeen.get(c.distinctId)!,
      })),
    );
    const won = await db
      .insert(personDistinctIds)
      .values(part.map((c) => ({ projectId, distinctId: c.distinctId, personId: c.personId })))
      .onConflictDoNothing()
      .returning({ distinctId: personDistinctIds.distinctId });
    const wonSet = new Set(won.map((w) => w.distinctId));
    const lost = part.filter((c) => !wonSet.has(c.distinctId));
    // Another worker mapped these distinct ids concurrently: drop our orphan persons and use theirs.
    if (lost.length) {
      await db.delete(persons).where(inArray(persons.id, lost.map((l) => l.personId)));
      const theirs = await lookupPersons(db, projectId, lost.map((l) => l.distinctId));
      for (const [d, p] of theirs) found.set(d, p);
    }
    for (const c of part) if (wonSet.has(c.distinctId)) found.set(c.distinctId, c.personId);
  }
  return found;
}

/**
 * Link an anonymous distinct id to an identified one.
 * If both already belong to different persons, the anonymous person is merged into the identified
 * one — unless it was itself identified, which would mean merging two real users.
 */
export async function mergeIdentity(db: DB, projectId: string, identified: string, anon: string, at: Date) {
  const m = await lookupPersons(db, projectId, [identified, anon]);
  const anonPerson = m.get(anon);
  const idPerson = m.get(identified);

  if (!anonPerson && !idPerson) {
    const id = crypto.randomUUID();
    await db.insert(persons).values({ id, projectId, firstSeen: at, lastSeen: at, isIdentified: 1 });
    await db
      .insert(personDistinctIds)
      .values([
        { projectId, distinctId: identified, personId: id },
        { projectId, distinctId: anon, personId: id },
      ])
      .onConflictDoNothing();
    return;
  }
  if (anonPerson && !idPerson) {
    await db.insert(personDistinctIds).values({ projectId, distinctId: identified, personId: anonPerson }).onConflictDoNothing();
    await db.update(persons).set({ isIdentified: 1 }).where(eq(persons.id, anonPerson));
    return;
  }
  if (!anonPerson && idPerson) {
    await db.insert(personDistinctIds).values({ projectId, distinctId: anon, personId: idPerson }).onConflictDoNothing();
    return;
  }
  if (anonPerson === idPerson) return;

  const [source] = await db.select().from(persons).where(eq(persons.id, anonPerson!));
  if (!source || source.isIdentified) return;
  const target = idPerson!;
  await db.update(personDistinctIds).set({ personId: target }).where(eq(personDistinctIds.personId, source.id));
  await db.update(events).set({ personId: target }).where(and(eq(events.projectId, projectId), eq(events.personId, source.id)));
  await db
    .update(sessions)
    .set({ personId: target })
    .where(and(eq(sessions.projectId, projectId), eq(sessions.personId, source.id)));
  await db
    .update(persons)
    .set({
      properties: sql`${JSON.stringify(source.properties)}::jsonb || ${persons.properties}`,
      firstSeen: sql`least(${persons.firstSeen}, ${source.firstSeen.toISOString()}::timestamptz)`,
      lastSeen: sql`greatest(${persons.lastSeen}, ${source.lastSeen.toISOString()}::timestamptz)`,
      isIdentified: 1,
    })
    .where(eq(persons.id, target));
  await db.delete(persons).where(eq(persons.id, source.id));
}

async function updatePersons(db: DB, evs: QueuedEvent[], personOf: Map<string, string>) {
  type Acc = { set: Record<string, unknown>; setOnce: Record<string, unknown>; first: string; last: string; identified: boolean };
  const acc = new Map<string, Acc>();
  for (const e of evs) {
    const pid = personOf.get(e.distinctId)!;
    const a = acc.get(pid) ?? { set: {}, setOnce: {}, first: e.timestamp, last: e.timestamp, identified: false };
    if (isObject(e.properties.$set)) Object.assign(a.set, e.properties.$set);
    if (isObject(e.properties.$set_once)) {
      for (const [k, v] of Object.entries(e.properties.$set_once)) if (!(k in a.setOnce)) a.setOnce[k] = v;
    }
    if (e.event === "$identify") a.identified = true;
    if (e.timestamp < a.first) a.first = e.timestamp;
    if (e.timestamp > a.last) a.last = e.timestamp;
    acc.set(pid, a);
  }
  for (const part of chunk([...acc.entries()], 500)) {
    const values = sql.join(
      part.map(
        ([id, a]) =>
          sql`(${id}::uuid, ${JSON.stringify(a.setOnce)}::jsonb, ${JSON.stringify(a.set)}::jsonb, ${a.first}::timestamptz, ${a.last}::timestamptz, ${a.identified ? 1 : 0}::int)`,
      ),
      sql`, `,
    );
    await db.execute(sql`
      update persons p set
        properties = (v.set_once || p.properties) || v.set_props,
        first_seen = least(p.first_seen, v.first_seen),
        last_seen = greatest(p.last_seen, v.last_seen),
        is_identified = greatest(p.is_identified, v.identified)
      from (values ${values}) as v(id, set_once, set_props, first_seen, last_seen, identified)
      where p.id = v.id`);
  }
}

async function upsertSessions(db: DB, projectId: string, evs: ProcessedEvent[]) {
  type S = typeof sessions.$inferInsert;
  const agg = new Map<string, S>();
  for (const e of evs) {
    if (!e.sessionId) continue;
    const url = str(e.properties.$current_url);
    const s = agg.get(e.sessionId);
    if (!s) {
      agg.set(e.sessionId, {
        projectId,
        id: e.sessionId,
        personId: e.personId,
        distinctId: e.distinctId,
        startedAt: e.timestamp,
        endedAt: e.timestamp,
        eventCount: 1,
        pageviewCount: e.event === "$pageview" ? 1 : 0,
        entryUrl: url,
        exitUrl: url,
        referrer: str(e.properties.$referrer),
        browser: str(e.properties.$browser),
        os: str(e.properties.$os),
        deviceType: str(e.properties.$device_type),
      });
      continue;
    }
    // events are sorted by timestamp, so later events extend the session
    s.endedAt = e.timestamp;
    s.eventCount! += 1;
    if (e.event === "$pageview") s.pageviewCount! += 1;
    if (url) s.exitUrl = url;
    if (!s.entryUrl && url) s.entryUrl = url;
    s.personId = e.personId;
    s.distinctId = e.distinctId;
  }
  if (agg.size === 0) return;
  for (const part of chunk([...agg.values()], INSERT_CHUNK)) {
    await db
      .insert(sessions)
      .values(part)
      .onConflictDoUpdate({
        target: [sessions.projectId, sessions.id],
        set: {
          startedAt: sql`least(${sessions.startedAt}, excluded.started_at)`,
          endedAt: sql`greatest(${sessions.endedAt}, excluded.ended_at)`,
          eventCount: sql`${sessions.eventCount} + excluded.event_count`,
          pageviewCount: sql`${sessions.pageviewCount} + excluded.pageview_count`,
          entryUrl: sql`case when excluded.started_at < ${sessions.startedAt} then coalesce(excluded.entry_url, ${sessions.entryUrl}) else coalesce(${sessions.entryUrl}, excluded.entry_url) end`,
          exitUrl: sql`case when excluded.ended_at >= ${sessions.endedAt} then coalesce(excluded.exit_url, ${sessions.exitUrl}) else coalesce(${sessions.exitUrl}, excluded.exit_url) end`,
          referrer: sql`coalesce(${sessions.referrer}, excluded.referrer)`,
          browser: sql`coalesce(${sessions.browser}, excluded.browser)`,
          os: sql`coalesce(${sessions.os}, excluded.os)`,
          deviceType: sql`coalesce(${sessions.deviceType}, excluded.device_type)`,
          personId: sql`excluded.person_id`,
          distinctId: sql`excluded.distinct_id`,
        },
      });
  }
}

async function upsertDefinitions(db: DB, projectId: string, evs: ProcessedEvent[]) {
  const counts = new Map<string, { n: number; first: Date; last: Date }>();
  for (const e of evs) {
    const c = counts.get(e.event) ?? { n: 0, first: e.timestamp, last: e.timestamp };
    c.n += 1;
    if (e.timestamp < c.first) c.first = e.timestamp;
    if (e.timestamp > c.last) c.last = e.timestamp;
    counts.set(e.event, c);
  }
  await db
    .insert(eventDefinitions)
    .values([...counts].map(([name, c]) => ({ projectId, name, volume: c.n, firstSeen: c.first, lastSeen: c.last })))
    .onConflictDoUpdate({
      target: [eventDefinitions.projectId, eventDefinitions.name],
      set: {
        volume: sql`${eventDefinitions.volume} + excluded.volume`,
        firstSeen: sql`least(${eventDefinitions.firstSeen}, excluded.first_seen)`,
        lastSeen: sql`greatest(${eventDefinitions.lastSeen}, excluded.last_seen)`,
      },
    });
}
