import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@pulseboard/core";
import { dateRangeSchema, insightQuerySchema, runInsight } from "@pulseboard/core/analytics";
import { sha256 } from "@/lib/crypto";
import { corsHeaders, json } from "@/lib/cors";

export const dynamic = "force-dynamic";

const body = z.object({ query: insightQuerySchema, dateRange: dateRangeSchema.optional() });

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Server-to-server query API.
 *
 *   curl -X POST $APP_URL/api/v1/query \
 *     -H "Authorization: Bearer sk_..." -H "Content-Type: application/json" \
 *     -d '{"query":{"type":"trend","series":[{"event":"$pageview"}],"dateRange":"7d"}}'
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(sk_[a-f0-9]{48})$/i)?.[1];
  if (!token) return json({ error: "Missing or malformed secret key" }, 401);

  const db = getDb();
  const [key] = await db
    .select({ id: schema.apiKeys.id, projectId: schema.apiKeys.projectId })
    .from(schema.apiKeys)
    .where(and(eq(schema.apiKeys.keyHash, sha256(token)), isNull(schema.apiKeys.revokedAt)));
  if (!key) return json({ error: "Invalid or revoked secret key" }, 401);

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Invalid query", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  }

  // Fire-and-forget usage stamp; don't make the caller wait on it.
  void db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, key.id)).catch(() => {});

  const result = await runInsight(db, key.projectId, parsed.data.query, { dateRange: parsed.data.dateRange });
  return json({ result });
}
