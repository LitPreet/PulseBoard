import { getDb } from "@pulseboard/core/db";
import { getRedis } from "@pulseboard/core/redis";
import { capturePayload, checkRateLimit, enqueueEvents, normalizePayload, resolveProjectKey } from "@pulseboard/core/ingest";
import { corsHeaders, json } from "@/lib/cors";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000;
const RATE_LIMIT = Number(process.env.INGEST_RATE_LIMIT ?? 1000);

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

/**
 * Public ingestion endpoint. Accepts JSON (fetch) or text/plain (navigator.sendBeacon).
 * Hot path: validate → resolve key (cached) → rate limit → XADD. Postgres is never touched
 * unless the key isn't cached yet.
 */
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "Payload too large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const parsed = capturePayload.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Invalid payload", issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) }, 400);
  }

  const redis = getRedis();
  const projectId = await resolveProjectKey(getDb(), redis, parsed.data.api_key);
  if (!projectId) return json({ error: "Unknown API key" }, 401);

  const events = normalizePayload(parsed.data, projectId, {
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  if (!(await checkRateLimit(redis, projectId, events.length, RATE_LIMIT))) {
    return json({ error: "Rate limit exceeded" }, 429, { "Retry-After": "1" });
  }

  await enqueueEvents(redis, events);
  return json({ status: "ok", accepted: events.length });
}
