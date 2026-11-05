"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import type { TrendResult } from "@pulseboard/core/analytics";
import { eventLabel, fmtBucket, fmtCompact, fmtNumber } from "@/lib/format";

/** Fixed categorical order — colour follows the series' position, never its rank after filtering. */
export const seriesColor = (i: number) => `var(--chart-${(i % 8) + 1})`;
const MAX_SERIES = 8;

function seriesName(s: TrendResult["series"][number]) {
  const base = `${eventLabel(s.event)}${s.math === "unique" ? " · unique users" : ""}`;
  if (s.breakdownValue === undefined) return base;
  return s.breakdownValue === "$direct" ? "Direct" : s.breakdownValue;
}

function ChartTooltip({ active, payload, label, interval }: Partial<TooltipContentProps<ValueType, NameType>> & { interval: TrendResult["interval"] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{fmtBucket(String(label), interval)}</p>
      {[...payload]
        .sort((a, b) => Number(b.value) - Number(a.value))
        .map((p) => (
          <p key={String(p.dataKey)} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
            <span className="text-muted">{p.name}</span>
            <span className="tabular ml-auto pl-4 font-medium">{fmtNumber(Number(p.value))}</span>
          </p>
        ))}
    </div>
  );
}

export function TrendChart({
  result,
  chart = "line",
  height = 280,
  showTable = true,
}: {
  result: TrendResult;
  chart?: "line" | "bar";
  height?: number;
  showTable?: boolean;
}) {
  const series = result.series.slice(0, MAX_SERIES);
  const data = result.labels.map((label, i) => {
    const row: Record<string, number | string> = { label };
    series.forEach((s, j) => (row[`s${j}`] = s.data[i] ?? 0));
    return row;
  });
  const hidden = result.series.length - series.length;

  if (series.length === 0 || series.every((s) => s.aggregate === 0)) {
    return <p className="py-16 text-center text-sm text-muted">No events match this query in the selected range.</p>;
  }

  const axes = (
    <>
      <CartesianGrid vertical={false} stroke="var(--grid)" />
      <XAxis
        dataKey="label"
        tickFormatter={(v) => fmtBucket(String(v), result.interval)}
        tick={{ fill: "var(--muted)", fontSize: 11 }}
        tickLine={false}
        axisLine={{ stroke: "var(--border)" }}
        minTickGap={24}
      />
      <YAxis
        tickFormatter={(v) => fmtCompact(Number(v))}
        tick={{ fill: "var(--muted)", fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={44}
        allowDecimals={false}
      />
      <Tooltip
        content={(props) => <ChartTooltip {...props} interval={result.interval} />}
        cursor={chart === "bar" ? { fill: "var(--surface-2)" } : { stroke: "var(--muted)", strokeDasharray: "3 3" }}
      />
    </>
  );

  return (
    <div>
      {series.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {series.map((s, i) => (
            <span key={i} className="flex items-center gap-1.5 text-muted">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: seriesColor(i) }} />
              {seriesName(s)}
            </span>
          ))}
        </div>
      )}
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {chart === "bar" ? (
            <BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              {axes}
              {series.map((s, i) => (
                <Bar
                  key={i}
                  dataKey={`s${i}`}
                  name={seriesName(s)}
                  stackId="a"
                  fill={seriesColor(i)}
                  stroke="var(--surface)"
                  strokeWidth={series.length > 1 ? 1 : 0}
                  radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
                  maxBarSize={40}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {axes}
              {series.map((s, i) => (
                <Line
                  key={i}
                  type="monotone"
                  dataKey={`s${i}`}
                  name={seriesName(s)}
                  stroke={seriesColor(i)}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      {showTable && (
        <table className="mt-4 w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1.5 font-medium">Series</th>
              <th className="py-1.5 text-right font-medium">Total in range</th>
            </tr>
          </thead>
          <tbody>
            {series.map((s, i) => (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: seriesColor(i) }} />
                    <span className="truncate">{seriesName(s)}</span>
                  </span>
                </td>
                <td className="tabular py-1.5 text-right font-medium">{fmtNumber(s.aggregate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {hidden > 0 && <p className="mt-2 text-xs text-muted">+{hidden} more series not shown</p>}
    </div>
  );
}
