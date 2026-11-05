import type { InsightResult } from "@pulseboard/core/analytics";
import { TrendChart } from "./trend-chart";
import { FunnelChart } from "./funnel-chart";
import { RetentionTable } from "./retention-table";

export function InsightView({
  result,
  chart,
  compact = false,
}: {
  result: InsightResult;
  chart?: "line" | "bar";
  compact?: boolean;
}) {
  switch (result.type) {
    case "trend":
      return <TrendChart result={result} chart={chart} height={compact ? 220 : 300} showTable={!compact} />;
    case "funnel":
      return <FunnelChart result={result} compact={compact} />;
    case "retention":
      return <RetentionTable result={result} />;
  }
}
