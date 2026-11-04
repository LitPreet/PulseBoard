import { sql } from "drizzle-orm";
import { rows, type DB } from "../db";
import { iso } from "./sql";
import { resolveDateRange, type RetentionQuery } from "./types";

export interface RetentionCohort {
  cohort: string;
  size: number;
  /** values[0] is the cohort size; values[k] = people active k periods later; null = in the future */
  values: (number | null)[];
}

export interface RetentionResult {
  type: "retention";
  period: "day" | "week";
  periods: number;
  cohorts: RetentionCohort[];
}

const DAY_MS = 86400e3;

/**
 * Cohort = the period of a person's *first ever* start event, if it falls inside the range.
 * A person is retained in period k if they performed the return event k periods after their cohort.
 */
export async function runRetention(db: DB, projectId: string, q: RetentionQuery, now = new Date()): Promise<RetentionResult> {
  const { from, to } = resolveDateRange(q.dateRange, now);
  const periodDays = q.period === "week" ? 7 : 1;
  const activityEnd = new Date(to.getTime() + q.periods * periodDays * DAY_MS);

  const result = await rows<{ cohort: string; k: number; n: number }>(
    db,
    sql`with first_start as (
          select person_id, min(timestamp) as first_ts
          from events where project_id = ${projectId} and event = ${q.startEvent}
          group by person_id
        ),
        cohort as (
          select person_id, date_trunc(${q.period}, first_ts at time zone 'UTC') as c
          from first_start
          where first_ts >= ${from.toISOString()}::timestamptz and first_ts < ${to.toISOString()}::timestamptz
        ),
        activity as (
          select distinct person_id, date_trunc(${q.period}, timestamp at time zone 'UTC') as p
          from events
          where project_id = ${projectId} and event = ${q.returnEvent}
            and timestamp >= ${from.toISOString()}::timestamptz and timestamp < ${activityEnd.toISOString()}::timestamptz
        ),
        offsets as (
          select c.c, ((a.p::date - c.c::date) / ${periodDays}::int) as k, c.person_id
          from cohort c join activity a on a.person_id = c.person_id and a.p > c.c
        )
        select ${iso(sql`c`)} as cohort, 0 as k, count(*)::int as n from cohort group by c
        union all
        select ${iso(sql`c`)} as cohort, k::int, count(distinct person_id)::int as n
        from offsets where k between 1 and ${q.periods - 1} group by c, k
        order by 1, 2`,
  );

  const byCohort = new Map<string, RetentionCohort>();
  for (const r of result) {
    const k = Number(r.k);
    let c = byCohort.get(r.cohort);
    if (!c) {
      const start = Date.parse(r.cohort);
      c = {
        cohort: r.cohort,
        size: 0,
        values: Array.from({ length: q.periods }, (_, i) => (start + i * periodDays * DAY_MS > now.getTime() ? null : 0)),
      };
      byCohort.set(r.cohort, c);
    }
    if (k === 0) c.size = r.n;
    if (c.values[k] !== null) c.values[k] = r.n;
  }
  const cohorts = [...byCohort.values()].sort((a, b) => a.cohort.localeCompare(b.cohort));
  for (const c of cohorts) c.values[0] = c.size;
  return { type: "retention", period: q.period, periods: q.periods, cohorts };
}
