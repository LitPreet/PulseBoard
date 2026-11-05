import Link from "next/link";
import { getDb } from "@pulseboard/core";
import { describeDateRange, listSessions, sessionStats } from "@pulseboard/core/analytics";
import { getProjectAccess } from "@/lib/access";
import { rangeFromSearchParams } from "@/lib/range";
import { fmtDateTime, fmtDuration, fmtNumber, fmtPercent } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, Stat, buttonClass } from "@/components/ui";
import { DateRangePicker } from "@/components/date-range-picker";

export const metadata = { title: "Sessions" };

const PAGE_SIZE = 50;

function pathOf(url: string | null) {
  if (!url) return "—";
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

export default async function SessionsPage(props: PageProps<"/p/[projectId]/sessions">) {
  const { projectId } = await props.params;
  const sp = await props.searchParams;
  const range = rangeFromSearchParams(sp);
  const page = Math.max(0, Number(typeof sp.page === "string" ? sp.page : 0) || 0);
  await getProjectAccess(projectId);
  const db = getDb();
  const [stats, list] = await Promise.all([
    sessionStats(db, projectId, range),
    listSessions(db, projectId, { range, limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE }),
  ]);
  const hasMore = list.length > PAGE_SIZE;
  const rows = list.slice(0, PAGE_SIZE);

  const pageHref = (p: number) => {
    const q = new URLSearchParams(Object.entries(sp).filter((e): e is [string, string] => typeof e[1] === "string"));
    q.set("page", String(p));
    return `?${q.toString()}`;
  };

  return (
    <>
      <PageHeader title="Sessions" description={describeDateRange(range)} actions={<DateRangePicker value={range} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Sessions" value={fmtNumber(stats.sessions)} />
        <Stat label="Avg. duration" value={fmtDuration(stats.avgDurationSeconds)} />
        <Stat label="Pages / session" value={stats.pagesPerSession.toFixed(1)} />
        <Stat label="Bounce rate" value={fmtPercent(stats.bounceRate)} sub="≤1 page and under 10s" />
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No sessions in this range" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Started</th>
                  <th className="px-4 py-2.5 font-medium">Person</th>
                  <th className="px-4 py-2.5 font-medium">Entry → exit</th>
                  <th className="px-4 py-2.5 font-medium">Device</th>
                  <th className="px-4 py-2.5 text-right font-medium">Pages</th>
                  <th className="px-4 py-2.5 text-right font-medium">Duration</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} className="border-t border-border hover:bg-surface-2">
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <Link href={`/p/${projectId}/sessions/${encodeURIComponent(s.id)}`} className="hover:text-accent hover:underline">
                        {fmtDateTime(s.startedAt)}
                      </Link>
                    </td>
                    <td className="max-w-[12rem] truncate px-4 py-2.5 font-mono text-xs">{s.distinctId}</td>
                    <td className="max-w-[18rem] truncate px-4 py-2.5 text-muted">
                      {pathOf(s.entryUrl)} → {pathOf(s.exitUrl)}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted">
                      {[s.browser, s.os].filter(Boolean).join(" · ") || "—"}
                      {s.deviceType === "Mobile" && (
                        <span className="ml-1.5">
                          <Badge>Mobile</Badge>
                        </span>
                      )}
                    </td>
                    <td className="tabular px-4 py-2.5 text-right">{s.pageviewCount}</td>
                    <td className="tabular px-4 py-2.5 text-right">{fmtDuration(s.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {(page > 0 || hasMore) && (
        <div className="mt-4 flex justify-between">
          {page > 0 ? (
            <Link href={pageHref(page - 1)} className={buttonClass("secondary", "sm")}>
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          {hasMore && (
            <Link href={pageHref(page + 1)} className={buttonClass("secondary", "sm")}>
              Older →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
