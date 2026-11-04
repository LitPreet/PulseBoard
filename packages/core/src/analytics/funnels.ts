import { sql, type SQL } from "drizzle-orm";
import { rows, type DB } from "../db";
import { filtersSql } from "./sql";
import { resolveDateRange, type FunnelQuery } from "./types";

export interface FunnelStepResult {
  index: number;
  event: string;
  count: number;
  /** Share of people who entered the funnel (step 0) that reached this step. */
  conversionRate: number;
  /** Share of the previous step that reached this step. */
  stepConversionRate: number;
  dropOff: number;
  /** Mean seconds from the previous step; null for the first step. */
  avgSecondsFromPrevious: number | null;
}

export interface FunnelResult {
  type: "funnel";
  windowDays: number;
  steps: FunnelStepResult[];
}

/**
 * Ordered funnel, one CTE per step:
 *  s0 = each person's first occurrence of step 0 within the date range (t0)
 *  sN = the first occurrence of step N after the time of step N-1, no later than t0 + window
 */
export async function runFunnel(db: DB, projectId: string, q: FunnelQuery, now = new Date()): Promise<FunnelResult> {
  const { from, to } = resolveDateRange(q.dateRange, now);
  const window = `${q.windowDays} days`;

  const ctes: SQL[] = [];
  const [first, ...rest] = q.steps;
  ctes.push(sql`s0 as (
    select person_id, min(timestamp) as t0, min(timestamp) as t
    from events
    where project_id = ${projectId} and event = ${first!.event}
      and timestamp >= ${from.toISOString()}::timestamptz and timestamp < ${to.toISOString()}::timestamptz
      ${filtersSql(first!.filters)}
    group by person_id
  )`);

  rest.forEach((step, i) => {
    const n = i + 1;
    const prev = sql.raw(`s${n - 1}`);
    // A repeated event (e.g. $pageview → $pageview) must be a *later* occurrence, not the same row.
    const after = step.event === q.steps[n - 1]!.event ? sql`e.timestamp > p.t` : sql`e.timestamp >= p.t`;
    ctes.push(sql`${sql.raw(`s${n}`)} as (
      select p.person_id, p.t0, min(e.timestamp) as t
      from ${prev} p
      join events e on e.project_id = ${projectId} and e.person_id = p.person_id and e.event = ${step.event}
        and ${after} and e.timestamp <= p.t0 + ${window}::interval
        ${filtersSql(step.filters, "e")}
      group by p.person_id, p.t0
    )`);
  });

  const selects: SQL[] = [sql`select 0 as step, count(*)::int as n, null::float8 as avg_s from s0`];
  for (let n = 1; n < q.steps.length; n++) {
    const cur = sql.raw(`s${n}`);
    const prev = sql.raw(`s${n - 1}`);
    selects.push(sql`select ${n}::int as step, count(*)::int as n,
      avg(extract(epoch from (${cur}.t - ${prev}.t)))::float8 as avg_s
      from ${cur} join ${prev} on ${prev}.person_id = ${cur}.person_id`);
  }

  const result = await rows<{ step: number; n: number; avg_s: number | null }>(
    db,
    sql`with ${sql.join(ctes, sql`, `)} ${sql.join(selects, sql` union all `)} order by 1`,
  );

  const counts = q.steps.map((_, i) => result.find((r) => Number(r.step) === i)?.n ?? 0);
  const avgs = q.steps.map((_, i) => result.find((r) => Number(r.step) === i)?.avg_s ?? null);
  const top = counts[0] ?? 0;

  return {
    type: "funnel",
    windowDays: q.windowDays,
    steps: q.steps.map((s, i) => {
      const count = counts[i]!;
      const prev = i === 0 ? count : counts[i - 1]!;
      return {
        index: i,
        event: s.event,
        count,
        conversionRate: top ? count / top : 0,
        stepConversionRate: prev ? count / prev : 0,
        dropOff: i === 0 ? 0 : prev - count,
        avgSecondsFromPrevious: i === 0 ? null : avgs[i] === null ? null : Number(avgs[i]),
      };
    }),
  };
}
