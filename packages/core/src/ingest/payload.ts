import { z } from "zod";

export const MAX_BATCH = 500;
const MAX_FUTURE_SKEW_MS = 60 * 60 * 1000;

const incomingEvent = z.object({
  event: z.string().trim().min(1).max(200),
  distinct_id: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(200)),
  properties: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().max(64).optional(),
  uuid: z.uuid().optional(),
  session_id: z.string().max(128).optional(),
});

export const capturePayload = z.union([
  z.object({
    api_key: z.string().min(1).max(200),
    batch: z.array(incomingEvent).min(1).max(MAX_BATCH),
    sent_at: z.string().max(64).optional(),
  }),
  incomingEvent.extend({ api_key: z.string().min(1).max(200), sent_at: z.string().max(64).optional() }),
]);

export type CapturePayload = z.infer<typeof capturePayload>;

/** The unit that travels through the Redis stream to the worker. */
export interface QueuedEvent {
  uuid: string;
  projectId: string;
  event: string;
  distinctId: string;
  sessionId: string | null;
  /** ISO string, already clock-skew corrected */
  timestamp: string;
  properties: Record<string, unknown>;
  userAgent?: string;
}

function parseDate(v: string | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

/**
 * Turn a validated payload into queue items.
 * Corrects client clock skew using `sent_at`: if the browser clock is 5 minutes fast,
 * every event in the batch is shifted back by 5 minutes.
 */
export function normalizePayload(
  payload: CapturePayload,
  projectId: string,
  opts: { now?: number; userAgent?: string; uuid?: () => string } = {},
): QueuedEvent[] {
  const now = opts.now ?? Date.now();
  const makeUuid = opts.uuid ?? (() => crypto.randomUUID());
  const batch = "batch" in payload ? payload.batch : [payload];
  const sentAt = parseDate(payload.sent_at);
  const skew = sentAt !== null ? now - sentAt : 0;

  return batch.map((e) => {
    const clientTs = parseDate(e.timestamp);
    let ts = clientTs !== null ? clientTs + skew : now;
    if (ts > now + MAX_FUTURE_SKEW_MS) ts = now;
    const properties = { ...(e.properties ?? {}) };
    return {
      uuid: e.uuid ?? makeUuid(),
      projectId,
      event: e.event,
      distinctId: e.distinct_id,
      sessionId: e.session_id ?? (typeof properties.$session_id === "string" ? properties.$session_id : null),
      timestamp: new Date(ts).toISOString(),
      properties,
      userAgent: opts.userAgent,
    };
  });
}
