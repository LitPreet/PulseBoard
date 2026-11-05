"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@pulseboard/core";
import { insightQuerySchema } from "@pulseboard/core/analytics";
import { requireProjectPermission } from "../access";
import type { FormState } from "./auth";

const saveSchema = z.object({
  projectId: z.uuid(),
  insightId: z.uuid().optional(),
  name: z.string().trim().min(1, "Give the insight a name").max(120),
  config: insightQuerySchema,
  dashboardId: z.uuid().optional(),
  newDashboardName: z.string().trim().max(120).optional(),
});

export type SaveInsightResult = { error?: string; insightId?: string; dashboardId?: string };

/** Create or update a saved insight, optionally pinning it to an (existing or new) dashboard. */
export async function saveInsight(input: z.input<typeof saveSchema>): Promise<SaveInsightResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { projectId, insightId, name, config, newDashboardName } = parsed.data;
  let { dashboardId } = parsed.data;
  try {
    const { user } = await requireProjectPermission(projectId, "edit_insights");
    const db = getDb();

    if (!dashboardId && newDashboardName) {
      const [d] = await db.insert(schema.dashboards).values({ projectId, name: newDashboardName, createdBy: user.id }).returning();
      dashboardId = d!.id;
    } else if (dashboardId) {
      const [d] = await db
        .select({ id: schema.dashboards.id })
        .from(schema.dashboards)
        .where(and(eq(schema.dashboards.id, dashboardId), eq(schema.dashboards.projectId, projectId)));
      if (!d) return { error: "Dashboard not found" };
    }

    let position = 0;
    if (dashboardId) {
      const [r] = await db
        .select({ p: max(schema.insights.position) })
        .from(schema.insights)
        .where(eq(schema.insights.dashboardId, dashboardId));
      position = (r?.p ?? -1) + 1;
    }

    if (insightId) {
      const [updated] = await db
        .update(schema.insights)
        .set({ name, config: config as Record<string, unknown>, type: config.type, ...(dashboardId ? { dashboardId } : {}) })
        .where(and(eq(schema.insights.id, insightId), eq(schema.insights.projectId, projectId)))
        .returning();
      if (!updated) return { error: "Insight not found" };
      revalidatePath(`/p/${projectId}/dashboards`, "layout");
      return { insightId: updated.id, dashboardId: updated.dashboardId ?? undefined };
    }

    const [created] = await db
      .insert(schema.insights)
      .values({ projectId, name, type: config.type, config: config as Record<string, unknown>, dashboardId, position, createdBy: user.id })
      .returning();
    revalidatePath(`/p/${projectId}/dashboards`, "layout");
    return { insightId: created!.id, dashboardId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not save" };
  }
}

export async function createDashboard(_: FormState, form: FormData): Promise<FormState> {
  const parsed = z
    .object({
      projectId: z.uuid(),
      name: z.string().trim().min(1, "Name is required").max(120),
      description: z.string().trim().max(500).optional(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { user } = await requireProjectPermission(parsed.data.projectId, "edit_insights");
  const [d] = await getDb()
    .insert(schema.dashboards)
    .values({ ...parsed.data, description: parsed.data.description || null, createdBy: user.id })
    .returning();
  redirect(`/p/${parsed.data.projectId}/dashboards/${d!.id}`);
}

export async function deleteDashboard(form: FormData) {
  const { projectId, dashboardId } = z.object({ projectId: z.uuid(), dashboardId: z.uuid() }).parse(Object.fromEntries(form));
  await requireProjectPermission(projectId, "edit_insights");
  const db = getDb();
  await db.delete(schema.insights).where(and(eq(schema.insights.dashboardId, dashboardId), eq(schema.insights.projectId, projectId)));
  await db.delete(schema.dashboards).where(and(eq(schema.dashboards.id, dashboardId), eq(schema.dashboards.projectId, projectId)));
  revalidatePath(`/p/${projectId}/dashboards`);
  redirect(`/p/${projectId}/dashboards`);
}

export async function deleteInsight(form: FormData) {
  const { projectId, insightId } = z.object({ projectId: z.uuid(), insightId: z.uuid() }).parse(Object.fromEntries(form));
  await requireProjectPermission(projectId, "edit_insights");
  await getDb().delete(schema.insights).where(and(eq(schema.insights.id, insightId), eq(schema.insights.projectId, projectId)));
  revalidatePath(`/p/${projectId}/dashboards`, "layout");
}

/** Move a tile one slot up or down on its dashboard. */
export async function moveInsight(form: FormData) {
  const { projectId, insightId, direction } = z
    .object({ projectId: z.uuid(), insightId: z.uuid(), direction: z.enum(["up", "down"]) })
    .parse(Object.fromEntries(form));
  await requireProjectPermission(projectId, "edit_insights");
  const db = getDb();
  const [tile] = await db.select().from(schema.insights).where(and(eq(schema.insights.id, insightId), eq(schema.insights.projectId, projectId)));
  if (!tile?.dashboardId) return;
  const siblings = await db
    .select({ id: schema.insights.id })
    .from(schema.insights)
    .where(eq(schema.insights.dashboardId, tile.dashboardId))
    .orderBy(schema.insights.position, schema.insights.createdAt);
  const i = siblings.findIndex((s) => s.id === insightId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
  await db.transaction(async (tx) => {
    for (const [position, s] of siblings.entries()) {
      await tx.update(schema.insights).set({ position }).where(eq(schema.insights.id, s.id));
    }
  });
  revalidatePath(`/p/${projectId}/dashboards/${tile.dashboardId}`);
}
