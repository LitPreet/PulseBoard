import type { RetentionResult } from "@pulseboard/core/analytics";
import { fmtNumber, fmtPercent } from "@/lib/format";

/** Cohort heatmap. Sequential single hue: opacity of --chart-1 encodes the retained share. */
export function RetentionTable({ result }: { result: RetentionResult }) {
  if (result.cohorts.length === 0) {
    return <p className="py-16 text-center text-sm text-muted">No cohorts in the selected range.</p>;
  }
  const unit = result.period === "week" ? "Week" : "Day";
  const totalSize = result.cohorts.reduce((a, c) => a + c.size, 0);
  // Weighted average per period, over cohorts old enough to have that period.
  const average = Array.from({ length: result.periods }, (_, k) => {
    const eligible = result.cohorts.filter((c) => c.values[k] !== null);
    const size = eligible.reduce((a, c) => a + c.size, 0);
    return size ? eligible.reduce((a, c) => a + (c.values[k] ?? 0), 0) / size : null;
  });

  const cell = (share: number | null, count: number | null, key: string) => (
    <td key={key} className="p-0.5">
      {share === null ? (
        <div className="h-8 rounded bg-surface-2/40" />
      ) : (
        <div
          className="tabular flex h-8 min-w-12 items-center justify-center rounded text-xs font-medium"
          style={{
            background: `color-mix(in srgb, var(--chart-1) ${Math.round(8 + share * 92)}%, var(--surface))`,
            color: share > 0.45 ? "white" : "var(--text)",
          }}
          title={count !== null ? `${fmtNumber(count)} people (${fmtPercent(share)})` : undefined}
        >
          {fmtPercent(share, 0)}
        </div>
      )}
    </td>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1.5 pr-3 text-left font-medium">Cohort</th>
            <th className="py-1.5 pr-3 text-right font-medium">People</th>
            {Array.from({ length: result.periods }, (_, k) => (
              <th key={k} className="px-0.5 py-1.5 text-center font-medium">
                {unit} {k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 pr-3 font-medium">Average</td>
            <td className="tabular py-1 pr-3 text-right">{fmtNumber(totalSize)}</td>
            {average.map((a, k) => cell(a, null, `avg${k}`))}
          </tr>
          {result.cohorts.map((c) => (
            <tr key={c.cohort}>
              <td className="py-1 pr-3 whitespace-nowrap text-muted">
                {new Date(c.cohort).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}
              </td>
              <td className="tabular py-1 pr-3 text-right">{fmtNumber(c.size)}</td>
              {c.values.map((v, k) => cell(v === null ? null : c.size ? v / c.size : 0, v, `${c.cohort}${k}`))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
