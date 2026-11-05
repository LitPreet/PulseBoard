import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { rows, type DB } from "../db";
import { events, persons, sessions } from "../schema";
import { resolveDateRange, type DateRangeInput } from "./types";

export interface SessionStats {
  sessions: number;
  avgDurationSeconds: number;
  bounceRate: number;
  pagesPerSession: number;
}

/** A bounce is a session with at most one pageview that lasted under 10 seconds. */
export async function sessionStats(db: DB, projectId: string, range: DateRangeInput, now = new Date()): Promise<SessionStats> {
  const { from, to } = resolveDateRange(range, now);
  const [r] = await rows<{ n: number; avg_s: number | null; bounces: number; pages: number | null }>(
    db,
    sql`select count(*)::int as n,
          avg(extract(epoch from (ended_at - started_at)))::float8 as avg_s,
          count(*) filter (where pageview_count <= 1 and ended_at - started_at < interval '10 seconds')::int as bounces,
          avg(pageview_count)::float8 as pages
        from sessions
        where project_id = ${projectId}
          and started_at >= ${from.toISOString()}::timestamptz and started_at < ${to.toISOString()}::timestamptz`,
  );
  const n = r?.n ?? 0;
  return {
    sessions: n,
    avgDurationSeconds: Number(r?.avg_s ?? 0),
    bounceRate: n ? (r?.bounces ?? 0) / n : 0,
    pagesPerSession: Number(r?.pages ?? 0),
  };
}

export async function listSessions(
  db: DB,
  projectId: string,
  opts: { range: DateRangeInput; limit?: number; offset?: number; personId?: string },
  now = new Date(),
) {
  const { from, to } = resolveDateRange(opts.range, now);
  const conditions = [
    eq(sessions.projectId, projectId),
    gte(sessions.startedAt, from),
    lt(sessions.startedAt, to),
  ];
  if (opts.personId) conditions.push(eq(sessions.personId, opts.personId));
  const list = await db
    .select()
    .from(sessions)
    .where(and(...conditions))
    .orderBy(desc(sessions.startedAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
  return list.map((s) => ({ ...s, durationSeconds: (s.endedAt.getTime() - s.startedAt.getTime()) / 1000 }));
}

export async function getSession(db: DB, projectId: string, sessionId: string) {
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.projectId, projectId), eq(sessions.id, sessionId)));
  if (!session) return null;
  const timeline = await db
    .select()
    .from(events)
    .where(and(eq(events.projectId, projectId), eq(events.sessionId, sessionId)))
    .orderBy(asc(events.timestamp))
    .limit(1000);
  const [person] = await db.select().from(persons).where(eq(persons.id, session.personId));
  return {
    session: { ...session, durationSeconds: (session.endedAt.getTime() - session.startedAt.getTime()) / 1000 },
    events: timeline,
    person: person ?? null,
  };
}
