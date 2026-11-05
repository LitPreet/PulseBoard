import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@pulseboard/core";
import { getProjectAccess } from "@/lib/access";
import { can } from "@/lib/permissions";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { CreateDashboardForm } from "@/components/dashboard-forms";

export const metadata = { title: "Dashboards" };

export default async function DashboardsPage(props: PageProps<"/p/[projectId]/dashboards">) {
  const { projectId } = await props.params;
  const { role } = await getProjectAccess(projectId);
  const list = await getDb()
    .select({
      id: schema.dashboards.id,
      name: schema.dashboards.name,
      description: schema.dashboards.description,
      tiles: count(schema.insights.id),
    })
    .from(schema.dashboards)
    .leftJoin(schema.insights, eq(schema.insights.dashboardId, schema.dashboards.id))
    .where(eq(schema.dashboards.projectId, projectId))
    .groupBy(schema.dashboards.id)
    .orderBy(asc(schema.dashboards.name));

  return (
    <>
      <PageHeader title="Dashboards" description="Collections of saved insights that share one date filter." />
      {can(role, "edit_insights") && (
        <Card className="mb-6 p-4">
          <CreateDashboardForm projectId={projectId} />
        </Card>
      )}
      {list.length === 0 ? (
        <Card>
          <EmptyState title="No dashboards yet">Create one above, or save an insight from Trends, Funnels or Retention.</EmptyState>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((d) => (
            <Link key={d.id} href={`/p/${projectId}/dashboards/${d.id}`}>
              <Card className="h-full p-5 transition hover:border-accent">
                <p className="font-medium">{d.name}</p>
                {d.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{d.description}</p>}
                <p className="mt-3 text-xs text-muted">
                  {d.tiles} insight{d.tiles === 1 ? "" : "s"}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
