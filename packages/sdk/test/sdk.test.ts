// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://app.example.com/"}
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capturePayload } from "../../core/src/ingest/payload";
import { PulseBoard, uuidv7 } from "../src/index";

type Sent = { url: string; body: unknown };

function setup() {
  const sent: Sent[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(init.body as string) });
      return new Response("{}", { status: 200 });
    }),
  );
  const pb = new PulseBoard().init("pk_test_1234567890", { apiHost: "https://pb.example.com/", flushIntervalMs: 60_000 });
  return { pb, sent };
}

beforeEach(() => {
  window.localStorage.clear();
  history.replaceState(null, "", "/");
});

describe("uuidv7", () => {
  it("is a valid, time-ordered UUID", () => {
    const a = uuidv7(1_700_000_000_000);
    const b = uuidv7(1_700_000_000_001);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});

describe("PulseBoard SDK", () => {
  it("captures an initial pageview and produces payloads the server accepts", async () => {
    const { pb, sent } = setup();
    pb.capture("clicked_cta", { button: "hero" });
    await pb.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe("https://pb.example.com/api/v1/capture");
    const parsed = capturePayload.parse(sent[0]!.body);
    if (!("batch" in parsed)) throw new Error("expected batch");
    expect(parsed.batch.map((e) => e.event)).toEqual(["$pageview", "clicked_cta"]);
    expect(parsed.batch[1]!.properties).toMatchObject({ button: "hero", $pathname: "/", $lib: "pulseboard-web" });
    expect(parsed.batch[0]!.session_id).toBe(parsed.batch[1]!.session_id);
  });

  it("captures SPA navigations as pageviews", async () => {
    const { pb, sent } = setup();
    history.pushState(null, "", "/pricing");
    await new Promise((r) => setTimeout(r, 5));
    await pb.flush();
    const batch = (sent[0]!.body as { batch: { event: string; properties: Record<string, unknown> }[] }).batch;
    expect(batch.filter((e) => e.event === "$pageview").map((e) => e.properties.$pathname)).toEqual(["/", "/pricing"]);
  });

  it("identify links the anonymous id and persists the new id", async () => {
    const { pb, sent } = setup();
    const anon = pb.getDistinctId();
    pb.identify("user_42", { email: "a@b.co" });
    await pb.flush();
    const batch = (sent[0]!.body as { batch: { event: string; distinct_id: string; properties: Record<string, unknown> }[] }).batch;
    const identify = batch.find((e) => e.event === "$identify")!;
    expect(identify.distinct_id).toBe("user_42");
    expect(identify.properties).toMatchObject({ $anon_distinct_id: anon, $set: { email: "a@b.co" } });
    expect(new PulseBoard().init("pk_test_1234567890", { apiHost: "x", capturePageviews: false }).getDistinctId()).toBe("user_42");
  });

  it("keeps events queued when the network fails", async () => {
    const { pb } = setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    pb.capture("a");
    await pb.flush();
    const stored = Object.entries(window.localStorage).find(([k]) => k.endsWith("_queue"));
    expect(JSON.parse(stored![1] as string)).toHaveLength(2);
  });

  it("respects opt-out", async () => {
    const { pb, sent } = setup();
    pb.optOut();
    pb.capture("secret");
    await pb.flush();
    expect(sent).toHaveLength(0);
  });
});
