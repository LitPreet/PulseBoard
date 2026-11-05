import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  insightQuerySchema,
  overviewTotals,
  runInsight,
  sessionStats,
  topValues,
  type FunnelResult,
  type InsightQueryInput,
  type RetentionResult,
  type TrendResult,
} from "../src/analytics";
import { processEvents, type QueuedEvent } from "../src/ingest";
import type { DB } from "../src/db";
import { createProject, createTestDb } from "./helpers";

let db: DB;
let close: () => Promise<void>;
let projectId: string;
const NOW = new Date("2026-03-01T12:00:00Z");
const day = (d: number, h = 10) => new Date(Date.UTC(2026, 1, d, h)).toISOString(); // Feb d

const ev = (distinctId: string, event: string, ts: string, properties: Record<string, unknown> = {}, sessionId = `${distinctId}-${ts.slice(0, 10)}`): QueuedEvent => ({
  uuid: crypto.randomUUID(),
  projectId,
  event,
  distinctId,
  sessionId,
  timestamp: ts,
  properties,
});

const run = (q: InsightQueryInput, dateRange?: Parameters<typeof runInsight>[3] extends infer O ? O extends { dateRange?: infer D } ? D : never : never) =>
  runInsight(db, projectId, insightQuerySchema.parse(q), { now: NOW, dateRange });

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  projectId = (await createProject(db)).id;
  await processEvents(db, [
    // alice: full funnel on Feb 2, returns in week 1 and 2
    ev("alice", "$pageview", day(2, 9), { $pathname: "/", plan: "pro" }),
    ev("alice", "signed_up", day(2, 10)),
    ev("alice", "created_project", day(2, 11)),
    ev("alice", "upgraded", day(3, 10)),
    ev("alice", "$pageview", day(10), { $pathname: "/app" }),
    ev("alice", "$pageview", day(17), { $pathname: "/app" }),
    // bob: signs up, creates project after the 14-day window → not converted
    ev("bob", "$pageview", day(2), { $pathname: "/pricing", plan: "free" }),
    ev("bob", "signed_up", day(2, 12)),
    ev("bob", "created_project", day(20)),
    // carol: only lands
    ev("carol", "$pageview", day(3), { $pathname: "/" }),
    ev("carol", "$pageview", day(3, 11), { $pathname: "/pricing" }),
    // dave: does steps out of order (create before sign up) → only step 1
    ev("dave", "created_project", day(4, 9)),
    ev("dave", "signed_up", day(4, 10)),
  ]);
});
afterAll(() => close());

describe("trends", () => {
  it("counts totals and unique users per day with zero-filled buckets", async () => {
    const r = (await run(
      {
        type: "trend",
        interval: "day",
        dateRange: { from: "2026-02-01", to: "2026-02-05" },
        series: [{ event: "$pageview" }, { event: "$pageview", math: "unique" }],
      },
    )) as TrendResult;
    expect(r.labels).toEqual([
      "2026-02-01T00:00:00Z",
      "2026-02-02T00:00:00Z",
      "2026-02-03T00:00:00Z",
      "2026-02-04T00:00:00Z",
      "2026-02-05T00:00:00Z",
    ]);
    expect(r.series[0]!.data).toEqual([0, 2, 2, 0, 0]);
    expect(r.series[1]!.data).toEqual([0, 2, 1, 0, 0]);
    expect(r.series[1]!.aggregate).toBe(3); // alice, bob, carol
  });

  it("applies property filters and breakdowns", async () => {
    const filtered = (await run({
      type: "trend",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      series: [{ event: "$pageview", filters: [{ key: "$pathname", op: "eq", value: "/pricing" }] }],
    })) as TrendResult;
    expect(filtered.series[0]!.aggregate).toBe(2);

    const broken = (await run({
      type: "trend",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      breakdown: "$pathname",
      series: [{ event: "$pageview" }],
    })) as TrendResult;
    expect(Object.fromEntries(broken.series.map((s) => [s.breakdownValue, s.aggregate]))).toEqual({ "/": 2, "/app": 2, "/pricing": 2 });
  });

  it("buckets by week", async () => {
    const r = (await run({
      type: "trend",
      interval: "week",
      dateRange: { from: "2026-02-02", to: "2026-02-22" },
      series: [{ event: "$pageview" }],
    })) as TrendResult;
    // Postgres weeks start on Monday: Feb 2, 9, 16 2026
    expect(r.labels).toEqual(["2026-02-02T00:00:00Z", "2026-02-09T00:00:00Z", "2026-02-16T00:00:00Z"]);
    expect(r.series[0]!.data).toEqual([4, 1, 1]);
  });
});

describe("funnels", () => {
  it("respects order and conversion window", async () => {
    const r = (await run({
      type: "funnel",
      windowDays: 14,
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      steps: [{ event: "signed_up" }, { event: "created_project" }, { event: "upgraded" }],
    })) as FunnelResult;
    expect(r.steps.map((s) => s.count)).toEqual([3, 1, 1]); // alice, bob, dave → alice → alice
    expect(r.steps[1]!.conversionRate).toBeCloseTo(1 / 3);
    expect(r.steps[1]!.dropOff).toBe(2);
    expect(r.steps[1]!.avgSecondsFromPrevious).toBe(3600);
    expect(r.steps[2]!.stepConversionRate).toBe(1);
  });

  it("a longer window lets late conversions count", async () => {
    const r = (await run({
      type: "funnel",
      windowDays: 30,
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      steps: [{ event: "signed_up" }, { event: "created_project" }],
    })) as FunnelResult;
    expect(r.steps.map((s) => s.count)).toEqual([3, 2]); // bob now counts
  });

  it("filters steps by property", async () => {
    const r = (await run({
      type: "funnel",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      steps: [{ event: "$pageview", filters: [{ key: "plan", op: "eq", value: "pro" }] }, { event: "signed_up" }],
    })) as FunnelResult;
    expect(r.steps.map((s) => s.count)).toEqual([1, 1]);
  });

  it("repeated events need a later occurrence", async () => {
    const r = (await run({
      type: "funnel",
      dateRange: { from: "2026-02-01", to: "2026-02-28" },
      steps: [{ event: "$pageview" }, { event: "$pageview" }],
    })) as FunnelResult;
    expect(r.steps.map((s) => s.count)).toEqual([3, 2]); // bob saw only one page
  });
});

describe("retention", () => {
  it("builds weekly cohorts from first-ever start event", async () => {
    const r = (await run({
      type: "retention",
      startEvent: "$pageview",
      returnEvent: "$pageview",
      period: "week",
      periods: 4,
      dateRange: { from: "2026-02-02", to: "2026-02-08" },
    })) as RetentionResult;
    expect(r.cohorts).toHaveLength(1);
    expect(r.cohorts[0]).toEqual({ cohort: "2026-02-02T00:00:00Z", size: 3, values: [3, 1, 1, 0] });
  });

  it("marks future periods as null", async () => {
    const r = await runInsight(
      db,
      projectId,
      insightQuerySchema.parse({ type: "retention", startEvent: "signed_up", returnEvent: "$pageview", period: "week", periods: 8, dateRange: { from: "2026-02-01", to: "2026-02-28" } }),
      { now: new Date("2026-02-20T00:00:00Z") },
    );
    const values = (r as RetentionResult).cohorts[0]!.values;
    expect(values.slice(-3)).toEqual([null, null, null]);
  });
});

describe("overview & sessions", () => {
  it("summarises totals, top values and session stats", async () => {
    const range = { from: "2026-02-01", to: "2026-02-28" } as const;
    expect(await overviewTotals(db, projectId, range, NOW)).toEqual({ events: 13, uniqueUsers: 4, pageviews: 6 });
    const pages = await topValues(db, projectId, { property: "$pathname", event: "$pageview", range }, NOW);
    expect(pages.map((p) => p.count)).toEqual([2, 2, 2]);
    const stats = await sessionStats(db, projectId, range, NOW);
    expect(stats.sessions).toBe(8); // alice 4, bob 2, carol 1, dave 1
    expect(stats.bounceRate).toBeGreaterThan(0);
  });
});
