import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { getDb, schema } from "@pulseboard/core";
import { describeDateRange, insightQuerySchema, runInsight, type InsightResult } from "@pulseboard/core/analytics";
import { getProjectAccess, isUuid } from "@/lib/access";
import { can } from "@/lib/permissions";
import { rangeFromSearchParams } from "@/lib/range";
import { deleteDashboard, deleteInsight, moveInsight } from "@/lib/actions/insights";
import { Card, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { ConfirmForm } from "@/components/form";
import { DateRangePicker } from "@/components/date-range-picker";
import { InsightView } from "@/components/charts/insight-view";

export const metadata = { title: "Dashboard" };

const BUILDER_PATH = { trend: "trends", funnel: "funnels", retention: "retention" } as const;

export default async function DashboardPage(props: PageProps<"/p/[projectId]/dashboards/[dashboardId]">) {
  const { projectId, dashboardId } = await props.params;
  const sp = await props.searchParams;
  if (!isUuid(dashboardId)) notFound();
  const { role } = await getProjectAccess(projectId);
  const db = getDb();
  const [dashboard] = await db
    .select()
    .from(schema.dashboards)
    .where(and(eq(schema.dashboards.id, dashboardId), eq(schema.dashboards.projectId, projectId)));
  if (!dashboard) notFound();

  const tiles = await db
    .select()
    .from(schema.insights)
    .where(eq(schema.insights.dashboardId, dashboardId))
    .orderBy(asc(schema.insights.position), asc(schema.insights.createdAt));

  // The dashboard filter overrides each tile's own range; without one, tiles keep their saved range.
  const hasFilter = typeof sp.range === "string" || (typeof sp.from === "string" && typeof sp.to === "string");
  const override = hasFilter ? rangeFromSearchParams(sp) : undefined;

  // Tiles run in parallel; one broken tile doesn't take the dashboard down.
  const results = await Promise.all(
    tiles.map(async (t): Promise<{ result?: InsightResult; error?: string; chart?: "line" | "bar"; range: string }> => {
      const parsed = insightQuerySchema.safeParse(t.config);
      if (!parsed.success) return { error: "This insight's saved config is invalid.", range: "" };
      try {
        const result = await runInsight(db, projectId, parsed.data, { dateRange: override });
        return {
          result,
          chart: parsed.data.type === "trend" ? parsed.data.chart : undefined,
          range: describeDateRange(override ?? parsed.data.dateRange),
        };
      } catch (err) {
        return { error: err instanceof Error ? err.message : "Query failed", range: "" };
      }
    }),
  );

  const editable = can(role, "edit_insights");

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href={`/p/${projectId}/dashboards`} className="text-muted hover:text-text">
          ← Dashboards
        </Link>
      </p>
      <PageHeader
        title={dashboard.name}
        description={dashboard.description ?? (override ? describeDateRange(override) : "Each tile uses its saved date range")}
        actions={
          <>
            <DateRangePicker value={override} unsetLabel="Each tile’s saved range" />
            {editable && (
              <ConfirmForm action={deleteDashboard} message={`Delete "${dashboard.name}" and its ${tiles.length} insights?`}>
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="dashboardId" value={dashboardId} />
                <button className={buttonClass("danger", "sm")} aria-label="Delete dashboard">
                  <Trash2 size={14} />
                </button>
              </ConfirmForm>
            )}
          </>
        }
      />

      {tiles.length === 0 ? (
        <Card>
          <EmptyState
            title="This dashboard is empty"
            action={
              <Link href={`/p/${projectId}/trends`} className={buttonClass("primary")}>
                Create an insight
              </Link>
            }
          >
            Build a trend, funnel or retention chart and choose &ldquo;Save to dashboard&rdquo;.
          </EmptyState>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {tiles.map((t, i) => {
            const r = results[i]!;
            return (
              <Card key={t.id} className={t.type === "retention" ? "min-w-0 xl:col-span-2" : "min-w-0"}>
                <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold">{t.name}</h2>
                    <p className="text-xs text-muted capitalize">
                      {t.type} · {r.range}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <Link
                      href={`/p/${projectId}/${BUILDER_PATH[t.type]}?insight=${t.id}`}
                      className={buttonClass("ghost", "sm")}
                      aria-label={`Edit ${t.name}`}
                    >
                      <Pencil size={13} />
                    </Link>
                    {editable && (
                      <>
                        {(["up", "down"] as const).map((dir) => (
                          <form key={dir} action={moveInsight}>
                            <input type="hidden" name="projectId" value={projectId} />
                            <input type="hidden" name="insightId" value={t.id} />
                            <input type="hidden" name="direction" value={dir} />
                            <button
                              className={buttonClass("ghost", "sm")}
                              disabled={dir === "up" ? i === 0 : i === tiles.length - 1}
                              aria-label={`Move ${t.name} ${dir}`}
                            >
                              {dir === "up" ? <ArrowUp size={13} /> : <ArrowDown size={13} />}
                            </button>
                          </form>
                        ))}
                        <ConfirmForm action={deleteInsight} message={`Remove "${t.name}" from this dashboard?`}>
                          <input type="hidden" name="projectId" value={projectId} />
                          <input type="hidden" name="insightId" value={t.id} />
                          <button className={buttonClass("ghost", "sm")} aria-label={`Remove ${t.name}`}>
                            <Trash2 size={13} />
                          </button>
                        </ConfirmForm>
                      </>
                    )}
                  </div>
                </div>
                <div className="px-5 py-4">
                  {r.error ? <p className="py-10 text-center text-sm text-danger">{r.error}</p> : <InsightView result={r.result!} chart={r.chart} compact />}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
