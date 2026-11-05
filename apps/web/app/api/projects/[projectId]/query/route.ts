import { z } from "zod";
import { getDb } from "@pulseboard/core";
import { dateRangeSchema, insightQuerySchema, runInsight } from "@pulseboard/core/analytics";
import { getCurrentUser } from "@/lib/auth";
import { findProjectAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

const body = z.object({ query: insightQuerySchema, dateRange: dateRangeSchema.optional() });

/** Run an insight for the signed-in user (used by the builders in the UI). */
export async function POST(request: Request, ctx: RouteContext<"/api/projects/[projectId]/query">) {
  const { projectId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await findProjectAccess(projectId, user.id))) return Response.json({ error: "Not found" }, { status: 404 });

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid query" }, { status: 400 });
  }
  const started = performance.now();
  const result = await runInsight(getDb(), projectId, parsed.data.query, { dateRange: parsed.data.dateRange });
  return Response.json({ result, ms: Math.round(performance.now() - started) });
}
