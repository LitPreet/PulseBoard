import type { FunnelResult } from "@pulseboard/core/analytics";
import { eventLabel, fmtDuration, fmtNumber, fmtPercent } from "@/lib/format";

/** Horizontal funnel: one bar per step, width = conversion from step 1. */
export function FunnelChart({ result, compact = false }: { result: FunnelResult; compact?: boolean }) {
  const first = result.steps[0];
  if (!first || first.count === 0) {
    return <p className="py-16 text-center text-sm text-muted">Nobody entered this funnel in the selected range.</p>;
  }
  const last = result.steps[result.steps.length - 1]!;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="tabular text-2xl font-semibold">{fmtPercent(last.conversionRate)}</span>
          <span className="ml-2 text-sm text-muted">overall conversion</span>
        </p>
        <p className="text-sm text-muted">
          {fmtNumber(last.count)} of {fmtNumber(first.count)} people · {result.windowDays}-day window
        </p>
      </div>
      <ol className="space-y-3">
        {result.steps.map((s) => (
          <li key={s.index} title={`${eventLabel(s.event)}: ${fmtNumber(s.count)} people (${fmtPercent(s.conversionRate)})`}>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="tabular mr-2 text-muted">{s.index + 1}</span>
                <span className="font-medium">{eventLabel(s.event)}</span>
              </span>
              <span className="tabular text-muted">
                <span className="font-medium text-text">{fmtNumber(s.count)}</span> · {fmtPercent(s.conversionRate)}
              </span>
            </div>
            <div className={`relative overflow-hidden rounded bg-surface-2 ${compact ? "h-5" : "h-7"}`}>
              <div
                className="absolute inset-y-0 left-0 rounded"
                style={{ width: `${Math.max(s.conversionRate * 100, 0.5)}%`, background: "var(--chart-1)" }}
              />
            </div>
            {s.index > 0 && !compact && (
              <p className="mt-1 text-xs text-muted">
                {fmtPercent(s.stepConversionRate)} from previous step · {fmtNumber(s.dropOff)} dropped off · avg{" "}
                {fmtDuration(s.avgSecondsFromPrevious)} to convert
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
