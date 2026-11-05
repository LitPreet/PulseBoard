import { DATE_PRESETS, dateRangeSchema, type DateRangeInput } from "@pulseboard/core/analytics";

type SP = Record<string, string | string[] | undefined>;

/** Read `?range=30d` or `?from=YYYY-MM-DD&to=YYYY-MM-DD` from search params. */
export function rangeFromSearchParams(sp: SP, fallback: DateRangeInput = "30d"): DateRangeInput {
  const from = typeof sp.from === "string" ? sp.from : undefined;
  const to = typeof sp.to === "string" ? sp.to : undefined;
  if (from && to) {
    const parsed = dateRangeSchema.safeParse({ from, to });
    if (parsed.success) return parsed.data;
  }
  const range = typeof sp.range === "string" ? sp.range : undefined;
  if (range && (DATE_PRESETS as readonly string[]).includes(range)) return range as DateRangeInput;
  return fallback;
}
