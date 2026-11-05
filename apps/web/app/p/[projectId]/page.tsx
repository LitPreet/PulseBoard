import Link from "next/link";
import { getDb } from "@pulseboard/core";
import {
  describeDateRange,
  overviewTotals,
  runTrend,
  sessionStats,
  topValues,
  trendQuerySchema,
} from "@pulseboard/core/analytics";
import { getProjectAccess } from "@/lib/access";
import { rangeFromSearchParams } from "@/lib/range";
import { fmtDuration, fmtNumber, fmtPercent } from "@/lib/format";
import { Card, CardHeader, EmptyState, PageHeader, Stat, buttonClass } from "@/components/ui";
import { DateRangePicker } from "@/components/date-range-picker";
import { TrendChart } from "@/components/charts/trend-chart";

export const metadata = { title: "Overview" };

function TopList({ title, rows, total }: { title: string; rows: { value: string; count: number }[]; total: number }) {
  return (
    <Card>
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No data yet.</p>
      ) : (
        <ul className="px-5 py-3">
          {rows.map((r) => (
            <li key={r.value} className="relative py-1.5 text-sm">
              <div
                className="absolute inset-y-0.5 left-0 rounded bg-accent-soft"
                style={{ width: `${total ? (r.count / total) * 100 : 0}%` }}
                aria-hidden
              />
              <div className="relative flex justify-between gap-3 px-2">
                <span className="truncate">{r.value === "$direct" ? "Direct / none" : r.value}</span>
                <span className="tabular text-muted">{fmtNumber(r.count)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export default async function OverviewPage(props: PageProps<"/p/[projectId]">) {
  const { projectId } = await props.params;
  const range = rangeFromSearchParams(await props.searchParams);
  const { project } = await getProjectAccess(projectId);
  const db = getDb();

  const [totals, stats, trend, pages, referrers, browsers, devices] = await Promise.all([
    overviewTotals(db, projectId, range),
    sessionStats(db, projectId, range),
    runTrend(
      db,
      projectId,
      trendQuerySchema.parse({
        type: "trend",
        dateRange: range,
        interval: range === "24h" ? "hour" : "day",
        series: [{ event: "$pageview", math: "unique" }, { event: "$pageview" }],
      }),
    ),
    topValues(db, projectId, { property: "$pathname", event: "$pageview", range }),
    topValues(db, projectId, { property: "$referring_domain", event: "$pageview", range }),
    topValues(db, projectId, { property: "$browser", event: "$pageview", range, limit: 6 }),
    topValues(db, projectId, { property: "$device_type", event: "$pageview", range, limit: 4 }),
  ]);

  return (
    <>
      <PageHeader title={project.name} description={describeDateRange(range)} actions={<DateRangePicker value={range} />} />
      {totals.events === 0 ? (
        <Card>
          <EmptyState
            title="No events in this range"
            action={
              <Link href={`/p/${projectId}/settings`} className={buttonClass("primary")}>
                Install the SDK
              </Link>
            }
          >
            Add the snippet to your site, or open <code className="font-mono text-xs">/demo.html?key={project.publicKey}</code> to send test events.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Unique users" value={fmtNumber(totals.uniqueUsers)} />
            <Stat label="Pageviews" value={fmtNumber(totals.pageviews)} sub={`${fmtNumber(totals.events)} events total`} />
            <Stat label="Sessions" value={fmtNumber(stats.sessions)} sub={`${stats.pagesPerSession.toFixed(1)} pages / session`} />
            <Stat label="Avg. session" value={fmtDuration(stats.avgDurationSeconds)} sub={`${fmtPercent(stats.bounceRate)} bounce rate`} />
          </div>
          <Card>
            <CardHeader title="Visitors over time" />
            <div className="px-5 py-4">
              <TrendChart result={trend} showTable={false} />
            </div>
          </Card>
          <div className="grid gap-6 md:grid-cols-2">
            <TopList title="Top pages" rows={pages} total={pages[0]?.count ?? 0} />
            <TopList title="Top referrers" rows={referrers} total={referrers[0]?.count ?? 0} />
            <TopList title="Browsers" rows={browsers} total={browsers[0]?.count ?? 0} />
            <TopList title="Devices" rows={devices} total={devices[0]?.count ?? 0} />
          </div>
        </div>
      )}
    </>
  );
}
