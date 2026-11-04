import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { capturePayload, normalizePayload, parseUserAgent, processEvents, type QueuedEvent } from "../src/ingest";
import * as schema from "../src/schema";
import type { DB } from "../src/db";
import { createProject, createTestDb } from "./helpers";

let db: DB;
let close: () => Promise<void>;
let projectId: string;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  projectId = (await createProject(db)).id;
});
afterEach(() => close());

const ev = (over: Partial<QueuedEvent>): QueuedEvent => ({
  uuid: crypto.randomUUID(),
  projectId,
  event: "$pageview",
  distinctId: "anon-1",
  sessionId: "s1",
  timestamp: "2026-01-01T10:00:00.000Z",
  properties: {},
  ...over,
});

describe("normalizePayload", () => {
  it("accepts single events and batches, corrects clock skew", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    const single = capturePayload.parse({ api_key: "pk_x", event: "a", distinct_id: 42 });
    expect(normalizePayload(single, projectId, { now })[0]).toMatchObject({ distinctId: "42", timestamp: new Date(now).toISOString() });

    const batch = capturePayload.parse({
      api_key: "pk_x",
      sent_at: "2026-01-01T12:05:00Z", // client clock 5 min fast
      batch: [{ event: "a", distinct_id: "u", timestamp: "2026-01-01T12:04:00Z" }],
    });
    expect(normalizePayload(batch, projectId, { now })[0]!.timestamp).toBe("2026-01-01T11:59:00.000Z");
  });

  it("rejects malformed payloads", () => {
    expect(capturePayload.safeParse({ api_key: "pk", batch: [] }).success).toBe(false);
    expect(capturePayload.safeParse({ api_key: "pk", batch: [{ event: "", distinct_id: "u" }] }).success).toBe(false);
  });
});

describe("parseUserAgent", () => {
  it("detects common browsers", () => {
    const iphone =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(iphone)).toEqual({ browser: "Safari", os: "iOS", deviceType: "Mobile" });
    const chrome =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
    expect(parseUserAgent(chrome)).toEqual({ browser: "Chrome", os: "macOS", deviceType: "Desktop" });
  });
});

describe("processEvents", () => {
  it("inserts events, creates persons, sessions and definitions", async () => {
    await processEvents(db, [
      ev({ properties: { $current_url: "https://a.com/", $referrer: "https://google.com" } }),
      ev({ timestamp: "2026-01-01T10:01:00.000Z", properties: { $current_url: "https://a.com/pricing" } }),
      ev({ event: "signed_up", timestamp: "2026-01-01T10:02:00.000Z" }),
    ]);
    const persons = await db.select().from(schema.persons);
    expect(persons).toHaveLength(1);
    const [session] = await db.select().from(schema.sessions);
    expect(session).toMatchObject({
      eventCount: 3,
      pageviewCount: 2,
      entryUrl: "https://a.com/",
      exitUrl: "https://a.com/pricing",
      referrer: "https://google.com",
    });
    expect(session!.endedAt.getTime() - session!.startedAt.getTime()).toBe(120_000);
    const defs = await db.select().from(schema.eventDefinitions);
    expect(Object.fromEntries(defs.map((d) => [d.name, d.volume]))).toEqual({ $pageview: 2, signed_up: 1 });
  });

  it("is idempotent on redelivery", async () => {
    const batch = [ev({}), ev({ event: "clicked" })];
    await processEvents(db, batch);
    const second = await processEvents(db, batch);
    expect(second).toHaveLength(0);
    expect(await db.select().from(schema.events)).toHaveLength(2);
    const [session] = await db.select().from(schema.sessions);
    expect(session!.eventCount).toBe(2);
  });

  it("extends sessions across batches, including late arrivals", async () => {
    await processEvents(db, [ev({ timestamp: "2026-01-01T10:05:00.000Z", properties: { $current_url: "/b" } })]);
    await processEvents(db, [ev({ timestamp: "2026-01-01T10:00:00.000Z", properties: { $current_url: "/a" } })]);
    const [s] = await db.select().from(schema.sessions);
    expect(s).toMatchObject({ eventCount: 2, entryUrl: "/a", exitUrl: "/b" });
  });

  it("merges an anonymous person into the identified person on $identify", async () => {
    // user browsed anonymously on two devices, then logged in on both
    await processEvents(db, [ev({ distinctId: "anon-1" }), ev({ distinctId: "anon-2", sessionId: "s2" })]);
    await processEvents(db, [
      ev({ event: "$identify", distinctId: "user@x.com", properties: { $anon_distinct_id: "anon-1", $set: { plan: "pro" } } }),
    ]);
    await processEvents(db, [
      ev({ event: "$identify", distinctId: "user@x.com", sessionId: "s2", properties: { $anon_distinct_id: "anon-2" } }),
    ]);

    const persons = await db.select().from(schema.persons);
    expect(persons).toHaveLength(1);
    expect(persons[0]!.properties).toEqual({ plan: "pro" });
    expect(persons[0]!.isIdentified).toBe(1);
    const evs = await db.select().from(schema.events);
    expect(new Set(evs.map((e) => e.personId))).toEqual(new Set([persons[0]!.id]));
    const sess = await db.select().from(schema.sessions);
    expect(sess.every((s) => s.personId === persons[0]!.id)).toBe(true);
  });

  it("never merges two identified users", async () => {
    await processEvents(db, [ev({ event: "$identify", distinctId: "alice", properties: { $anon_distinct_id: "anon-1" } })]);
    await processEvents(db, [ev({ event: "$identify", distinctId: "bob", properties: { $anon_distinct_id: "anon-9" } })]);
    // shared computer: alice's anon id later identifies as bob
    await processEvents(db, [ev({ event: "$identify", distinctId: "bob", properties: { $anon_distinct_id: "anon-1" } })]);
    expect(await db.select().from(schema.persons)).toHaveLength(2);
  });

  it("applies $set_once without overwriting", async () => {
    await processEvents(db, [ev({ properties: { $set_once: { first_source: "ads" }, $set: { plan: "free" } } })]);
    await processEvents(db, [
      ev({ timestamp: "2026-01-02T00:00:00.000Z", properties: { $set_once: { first_source: "seo" }, $set: { plan: "pro" } } }),
    ]);
    const [p] = await db.select().from(schema.persons);
    expect(p!.properties).toEqual({ first_source: "ads", plan: "pro" });
    expect(p!.lastSeen.toISOString()).toBe("2026-01-02T00:00:00.000Z");
  });

  it("enriches events with parsed user agent", async () => {
    await processEvents(db, [ev({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131.0" })]);
    const [e] = await db.select().from(schema.events).where(eq(schema.events.projectId, projectId));
    expect(e!.properties).toMatchObject({ $browser: "Firefox", $os: "Windows", $device_type: "Desktop" });
  });
});
