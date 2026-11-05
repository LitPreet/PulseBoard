import { and, asc, eq } from "drizzle-orm";
import { getDb, schema } from "@pulseboard/core";
import { insightQuerySchema, listEventNames } from "@pulseboard/core/analytics";
import { getProjectAccess, isUuid } from "@/lib/access";
import { can } from "@/lib/permissions";
import { InsightBuilder, type BuilderType } from "./insight-builder";
import { PageHeader } from "./ui";

/** Shared server wrapper for the Trends / Funnels / Retention pages. `?insight=<id>` opens a saved insight. */
export async function BuilderPage({
  projectId,
  type,
  title,
  description,
  insightId,
}: {
  projectId: string;
  type: BuilderType;
  title: string;
  description: string;
  insightId?: string;
}) {
  const { role } = await getProjectAccess(projectId);
  const db = getDb();
  const [events, dashboards, saved] = await Promise.all([
    listEventNames(db, projectId),
    db
      .select({ id: schema.dashboards.id, name: schema.dashboards.name })
      .from(schema.dashboards)
      .where(eq(schema.dashboards.projectId, projectId))
      .orderBy(asc(schema.dashboards.name)),
    insightId && isUuid(insightId)
      ? db
          .select()
          .from(schema.insights)
          .where(and(eq(schema.insights.id, insightId), eq(schema.insights.projectId, projectId)))
          .then((r) => r[0])
      : Promise.resolve(undefined),
  ]);

  const parsed = saved && saved.type === type ? insightQuerySchema.safeParse(saved.config) : undefined;
  const initial =
    saved && parsed?.success ? { id: saved.id, name: saved.name, config: parsed.data, dashboardId: saved.dashboardId } : undefined;

  return (
    <>
      <PageHeader title={initial ? initial.name : title} description={description} />
      <InsightBuilder
        key={initial?.id ?? type}
        projectId={projectId}
        type={type}
        eventNames={events.map((e) => e.name)}
        dashboards={dashboards}
        canEdit={can(role, "edit_insights")}
        initial={initial}
      />
    </>
  );
}
