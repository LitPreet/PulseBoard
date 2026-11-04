import { z } from "zod";

export const DATE_PRESETS = ["24h", "7d", "14d", "30d", "90d", "180d"] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

export const dateRangeSchema = z.union([
  z.enum(DATE_PRESETS),
  z.object({ from: z.iso.datetime({ offset: true }).or(z.iso.date()), to: z.iso.datetime({ offset: true }).or(z.iso.date()) }),
]);
export type DateRangeInput = z.infer<typeof dateRangeSchema>;

export const propertyFilterSchema = z.object({
  key: z.string().min(1).max(200),
  op: z.enum(["eq", "neq", "contains", "not_contains", "is_set", "is_not_set", "gt", "lt"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type PropertyFilter = z.infer<typeof propertyFilterSchema>;

const filters = z.array(propertyFilterSchema).max(10).default([]);
const eventName = z.string().min(1).max(200);

export const INTERVALS = ["hour", "day", "week", "month"] as const;
export type Interval = (typeof INTERVALS)[number];

export const trendQuerySchema = z.object({
  type: z.literal("trend"),
  series: z
    .array(z.object({ event: eventName, math: z.enum(["total", "unique"]).default("total"), filters }))
    .min(1)
    .max(6),
  interval: z.enum(INTERVALS).default("day"),
  dateRange: dateRangeSchema.default("30d"),
  breakdown: z.string().min(1).max(200).optional(),
  chart: z.enum(["line", "bar"]).default("line"),
});

export const funnelQuerySchema = z.object({
  type: z.literal("funnel"),
  steps: z.array(z.object({ event: eventName, filters })).min(2).max(10),
  windowDays: z.number().int().min(1).max(90).default(14),
  dateRange: dateRangeSchema.default("30d"),
});

export const retentionQuerySchema = z.object({
  type: z.literal("retention"),
  startEvent: eventName,
  returnEvent: eventName,
  period: z.enum(["day", "week"]).default("week"),
  periods: z.number().int().min(2).max(16).default(8),
  dateRange: dateRangeSchema.default("90d"),
});

export const insightQuerySchema = z.discriminatedUnion("type", [trendQuerySchema, funnelQuerySchema, retentionQuerySchema]);

export type TrendQuery = z.infer<typeof trendQuerySchema>;
export type FunnelQuery = z.infer<typeof funnelQuerySchema>;
export type RetentionQuery = z.infer<typeof retentionQuerySchema>;
export type InsightQuery = z.infer<typeof insightQuerySchema>;
/** Shape accepted before defaults are applied (what the UI/API sends). */
export type InsightQueryInput = z.input<typeof insightQuerySchema>;

export interface ResolvedRange {
  from: Date;
  to: Date;
}

const PRESET_MS: Record<DatePreset, number> = {
  "24h": 24 * 3600e3,
  "7d": 7 * 86400e3,
  "14d": 14 * 86400e3,
  "30d": 30 * 86400e3,
  "90d": 90 * 86400e3,
  "180d": 180 * 86400e3,
};

/** Presets are relative to `now`; custom dates are inclusive of the whole `to` day. */
export function resolveDateRange(input: DateRangeInput, now = new Date()): ResolvedRange {
  if (typeof input === "string") {
    if (input === "24h") return { from: new Date(now.getTime() - PRESET_MS[input]), to: now };
    // whole days, so day buckets aren't half-empty at the left edge
    const from = new Date(now.getTime() - PRESET_MS[input] + 86400e3);
    from.setUTCHours(0, 0, 0, 0);
    return { from, to: now };
  }
  const from = new Date(input.from);
  const to = new Date(input.to);
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.to)) to.setUTCDate(to.getUTCDate() + 1);
  return from <= to ? { from, to } : { from: to, to: from };
}

export function describeDateRange(input: DateRangeInput): string {
  if (typeof input !== "string") return `${input.from.slice(0, 10)} → ${input.to.slice(0, 10)}`;
  return input === "24h" ? "Last 24 hours" : `Last ${input.replace("d", "")} days`;
}
