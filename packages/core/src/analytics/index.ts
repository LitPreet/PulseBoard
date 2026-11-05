import type { DB } from "../db";
import { runFunnel, type FunnelResult } from "./funnels";
import { runRetention, type RetentionResult } from "./retention";
import { runTrend, type TrendResult } from "./trends";
import { resolveDateRange, type DateRangeInput, type InsightQuery } from "./types";

export * from "./types";
export * from "./trends";
export * from "./funnels";
export * from "./retention";
export * from "./sessions";
export * from "./overview";

export type InsightResult = TrendResult | FunnelResult | RetentionResult;

/** Run any insight query. `dateRange` overrides the query's own range (used by dashboard filters). */
export async function runInsight(
  db: DB,
  projectId: string,
  query: InsightQuery,
  opts: { dateRange?: DateRangeInput; now?: Date } = {},
): Promise<InsightResult> {
  const q = opts.dateRange ? { ...query, dateRange: opts.dateRange } : query;
  // Guard against huge hourly series.
  if (q.type === "trend" && q.interval === "hour") {
    const { from, to } = resolveDateRange(q.dateRange, opts.now);
    if (to.getTime() - from.getTime() > 14 * 86400e3) q.interval = "day";
  }
  switch (q.type) {
    case "trend":
      return runTrend(db, projectId, q, opts.now);
    case "funnel":
      return runFunnel(db, projectId, q, opts.now);
    case "retention":
      return runRetention(db, projectId, q, opts.now);
  }
}
