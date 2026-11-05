import { and, desc, eq, lt, sql } from "drizzle-orm";
import { rows, type DB } from "../db";
import { eventDefinitions, events } from "../schema";
import { resolveDateRange, type DateRangeInput } from "./types";

export interface OverviewTotals {
  events: number;
  uniqueUsers: number;
  pageviews: number;
}

export async function overviewTotals(db: DB, projectId: string, range: DateRangeInput, now = new Date()): Promise<OverviewTotals> {
  const { from, to } = resolveDateRange(range, now);
  const [r] = await rows<{ events: number; users: number; pageviews: number }>(
    db,
    sql`select count(*)::int as events,
          count(distinct person_id)::int as users,
          count(*) filter (where event = '$pageview')::int as pageviews
        from events
        where project_id = ${projectId}
          and timestamp >= ${from.toISOString()}::timestamptz and timestamp < ${to.toISOString()}::timestamptz`,
  );
  return { events: r?.events ?? 0, uniqueUsers: r?.users ?? 0, pageviews: r?.pageviews ?? 0 };
}

/** Most common values of a property, optionally restricted to one event. */
export async function topValues(
  db: DB,
  projectId: string,
  opts: { property: string; event?: string; range: DateRangeInput; limit?: number },
  now = new Date(),
) {
  const { from, to } = resolveDateRange(opts.range, now);
  return rows<{ value: string; count: number; users: number }>(
    db,
    sql`select coalesce(properties ->> ${opts.property}, '(none)') as value,
          count(*)::int as count, count(distinct person_id)::int as users
        from events
        where project_id = ${projectId}
          ${opts.event ? sql`and event = ${opts.event}` : sql``}
          and timestamp >= ${from.toISOString()}::timestamptz and timestamp < ${to.toISOString()}::timestamptz
        group by 1 order by 2 desc limit ${opts.limit ?? 8}`,
  );
}

export async function recentEvents(db: DB, projectId: string, opts: { limit?: number; event?: string; before?: Date } = {}) {
  const conditions = [eq(events.projectId, projectId)];
  if (opts.event) conditions.push(eq(events.event, opts.event));
  if (opts.before) conditions.push(lt(events.timestamp, opts.before));
  return db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.timestamp))
    .limit(Math.min(opts.limit ?? 100, 500));
}

export async function listEventNames(db: DB, projectId: string) {
  return db
    .select({ name: eventDefinitions.name, volume: eventDefinitions.volume, lastSeen: eventDefinitions.lastSeen })
    .from(eventDefinitions)
    .where(eq(eventDefinitions.projectId, projectId))
    .orderBy(desc(eventDefinitions.volume))
    .limit(500);
}
