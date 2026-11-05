import { sql } from "drizzle-orm";
import { rows, type DB } from "../db";
import { filtersSql, iso } from "./sql";
import { resolveDateRange, type Interval, type TrendQuery } from "./types";

export interface TrendSeries {
  label: string;
  event: string;
  math: "total" | "unique";
  breakdownValue?: string;
  data: number[];
  /** Total over the whole range. For `unique`, this is distinct persons across the range (not a sum). */
  aggregate: number;
}

export interface TrendResult {
  type: "trend";
  interval: Interval;
  labels: string[];
  series: TrendSeries[];
}

const BREAKDOWN_LIMIT = 8;
const MAX_BUCKETS = 2000;

export async function runTrend(db: DB, projectId: string, q: TrendQuery, now = new Date()): Promise<TrendResult> {
  const { from, to } = resolveDateRange(q.dateRange, now);
  const interval = q.interval;
  const step = `1 ${interval}`;

  const bucketRows = await rows<{ b: string }>(
    db,
    sql`select ${iso(sql`g`)} as b from generate_series(
          date_trunc(${interval}, ${from.toISOString()}::timestamptz at time zone 'UTC'),
          date_trunc(${interval}, (${to.toISOString()}::timestamptz - interval '1 millisecond') at time zone 'UTC'),
          ${step}::interval) as g limit ${MAX_BUCKETS}`,
  );
  const labels = bucketRows.map((r) => r.b);
  const index = new Map(labels.map((l, i) => [l, i]));

  const series: TrendSeries[] = [];
  for (const s of q.series) {
    const where = sql`project_id = ${projectId} and event = ${s.event}
      and timestamp >= ${from.toISOString()}::timestamptz and timestamp < ${to.toISOString()}::timestamptz
      ${filtersSql(s.filters)}`;
    const metric = s.math === "unique" ? sql`count(distinct person_id)::int` : sql`count(*)::int`;
    const label = `${s.event}${s.math === "unique" ? " (unique users)" : ""}`;

    if (!q.breakdown) {
      const counts = await rows<{ b: string; n: number }>(
        db,
        sql`select ${iso(sql`date_trunc(${interval}, timestamp at time zone 'UTC')`)} as b, ${metric} as n
            from events where ${where} group by 1`,
      );
      const [agg] = await rows<{ n: number }>(db, sql`select ${metric} as n from events where ${where}`);
      const data = labels.map(() => 0);
      for (const c of counts) {
        const i = index.get(c.b);
        if (i !== undefined) data[i] = c.n;
      }
      series.push({ label, event: s.event, math: s.math, data, aggregate: agg?.n ?? 0 });
      continue;
    }

    const value = sql`coalesce(properties ->> ${q.breakdown}, '(none)')`;
    const counts = await rows<{ v: string; b: string | null; n: number }>(
      db,
      sql`with top as (
            select ${value} as v from events where ${where}
            group by 1 order by count(*) desc limit ${BREAKDOWN_LIMIT}
          )
          select ${value} as v,
                 ${iso(sql`date_trunc(${interval}, timestamp at time zone 'UTC')`)} as b,
                 ${metric} as n
          from events where ${where} and ${value} in (select v from top)
          group by grouping sets ((1, 2), (1))`,
    );
    const byValue = new Map<string, { data: number[]; aggregate: number }>();
    for (const c of counts) {
      const entry = byValue.get(c.v) ?? { data: labels.map(() => 0), aggregate: 0 };
      if (c.b === null) entry.aggregate = c.n;
      else {
        const i = index.get(c.b);
        if (i !== undefined) entry.data[i] = c.n;
      }
      byValue.set(c.v, entry);
    }
    [...byValue.entries()]
      .sort((a, b) => b[1].aggregate - a[1].aggregate)
      .forEach(([v, e]) =>
        series.push({ label: `${label} · ${v}`, event: s.event, math: s.math, breakdownValue: v, data: e.data, aggregate: e.aggregate }),
      );
  }

  return { type: "trend", interval, labels, series };
}
