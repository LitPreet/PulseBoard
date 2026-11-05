/**
 * Seed a demo workspace with ~60 days of realistic product analytics data.
 *
 *   npm run seed            # demo@pulseboard.dev / demo1234
 *   npm run seed -- --reset # wipe the demo org first
 */
import { eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "@pulseboard/core";
import { hashPassword } from "@pulseboard/core/crypto";
import { processEvents, type QueuedEvent } from "@pulseboard/core/ingest";
import type { InsightQueryInput } from "@pulseboard/core/analytics";

const EMAIL = "demo@pulseboard.dev";
const PASSWORD = "demo1234";
const PUBLIC_KEY = "pk_demo_0000000000000000";
const DAYS = 60;
const USERS = Number(process.env.SEED_USERS ?? 4000);

// Deterministic PRNG so every seed looks the same.
let state = 42;
const rand = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T>(items: T[], weights?: number[]): T => {
  if (!weights) return items[Math.floor(rand() * items.length)]!;
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) if ((r -= weights[i]!) < 0) return items[i]!;
  return items[items.length - 1]!;
};

const SOURCES = [
  { referrer: "https://www.google.com/", domain: "www.google.com", weight: 40 },
  { referrer: "$direct", domain: "$direct", weight: 25 },
  { referrer: "https://twitter.com/", domain: "twitter.com", weight: 12 },
  { referrer: "https://news.ycombinator.com/", domain: "news.ycombinator.com", weight: 10 },
  { referrer: "https://www.producthunt.com/", domain: "www.producthunt.com", weight: 8 },
  { referrer: "https://www.linkedin.com/", domain: "www.linkedin.com", weight: 5 },
];
const DEVICES = [
  { $browser: "Chrome", $os: "macOS", $device_type: "Desktop", w: 34 },
  { $browser: "Chrome", $os: "Windows", $device_type: "Desktop", w: 22 },
  { $browser: "Safari", $os: "iOS", $device_type: "Mobile", w: 18 },
  { $browser: "Safari", $os: "macOS", $device_type: "Desktop", w: 10 },
  { $browser: "Firefox", $os: "Linux", $device_type: "Desktop", w: 6 },
  { $browser: "Chrome", $os: "Android", $device_type: "Mobile", w: 8 },
  { $browser: "Edge", $os: "Windows", $device_type: "Desktop", w: 2 },
];
const MARKETING = ["/", "/pricing", "/features", "/blog/launch-week", "/blog/funnels-101", "/docs"];
const APP = ["/app", "/app/notes", "/app/notes/new", "/app/settings", "/app/team"];
const PLANS = ["starter", "pro", "business"];
const COUNTRIES = ["US", "IN", "GB", "DE", "CA", "FR", "BR", "AU"];

async function main() {
  const db = getDb();
  const reset = process.argv.includes("--reset");

  let [user] = await db.select().from(schema.users).where(eq(schema.users.email, EMAIL));
  const [existingProject] = await db.select().from(schema.projects).where(eq(schema.projects.publicKey, PUBLIC_KEY));
  if (existingProject && reset) {
    await db.delete(schema.organizations).where(eq(schema.organizations.id, existingProject.orgId));
    console.log("• removed previous demo org");
  } else if (existingProject) {
    console.log(`Demo project already exists. Sign in as ${EMAIL} / ${PASSWORD}, or re-run with --reset.`);
    return;
  }

  if (!user) {
    [user] = await db
      .insert(schema.users)
      .values({ email: EMAIL, name: "Demo User", passwordHash: await hashPassword(PASSWORD) })
      .returning();
  }
  const [org] = await db.insert(schema.organizations).values({ name: "Acme Notes" }).returning();
  await db.insert(schema.memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
  const [project] = await db
    .insert(schema.projects)
    .values({ orgId: org!.id, name: "Acme Notes (production)", publicKey: PUBLIC_KEY })
    .returning();
  const projectId = project!.id;
  console.log(`• created org + project ${projectId}`);

  const now = Date.now();
  const events: QueuedEvent[] = [];
  const push = (distinctId: string, sessionId: string, t: number, event: string, properties: Record<string, unknown>) => {
    if (t >= now) return; // simulated activity that would happen in the future
    events.push({
      uuid: crypto.randomUUID(),
      projectId,
      event,
      distinctId,
      sessionId,
      timestamp: new Date(t).toISOString(),
      properties: { ...properties, $session_id: sessionId },
    });
  };

  for (let u = 0; u < USERS; u++) {
    // more users arrive in recent weeks (growth), with a weekly rhythm
    const dayOffset = Math.floor(DAYS * Math.pow(rand(), 0.75));
    let t = now - (DAYS - dayOffset) * 86400e3 + rand() * 86400e3 * 0.9;
    const weekday = new Date(t).getUTCDay();
    if ((weekday === 0 || weekday === 6) && rand() < 0.4) continue;

    const anon = crypto.randomUUID();
    const source = pick(SOURCES, SOURCES.map((s) => s.weight));
    const device = pick(DEVICES, DEVICES.map((d) => d.w));
    const { w: _w, ...deviceProps } = device;
    const country = pick(COUNTRIES, [40, 15, 10, 8, 7, 6, 8, 6]);
    const base = { ...deviceProps, $country: country, $initial_referring_domain: source.domain };
    const email = `user${u}@example.com`;
    let distinctId = anon;

    // Session 1: marketing site
    let session = crypto.randomUUID();
    const landing = pick(MARKETING, [40, 20, 15, 10, 8, 7]);
    const views = 1 + Math.floor(rand() * 4);
    for (let i = 0; i < views; i++) {
      const path = i === 0 ? landing : pick(MARKETING);
      push(distinctId, session, t, "$pageview", {
        ...base,
        $current_url: `https://acmenotes.io${path}`,
        $pathname: path,
        $referrer: i === 0 ? source.referrer : "https://acmenotes.io/",
        $referring_domain: i === 0 ? source.domain : "acmenotes.io",
      });
      t += (5 + rand() * 90) * 1000;
    }

    // Activation funnel with realistic drop-off (better from HN/PH, worse on mobile)
    const quality = (source.domain.includes("ycombinator") || source.domain.includes("producthunt") ? 1.25 : 1) * (device.$device_type === "Mobile" ? 0.7 : 1);
    if (rand() > 0.32 * quality) continue;
    push(distinctId, session, t, "signed_up", { ...base, $referring_domain: source.domain, method: pick(["email", "google", "github"], [50, 35, 15]) });
    t += 2000;
    push(email, session, t, "$identify", { ...base, $anon_distinct_id: anon, $set: { email, country, signup_source: source.domain } });
    distinctId = email;

    if (rand() > 0.72) continue;
    t += (1 + rand() * 20) * 60e3;
    push(distinctId, session, t, "$pageview", { ...base, $current_url: "https://acmenotes.io/app/notes/new", $pathname: "/app/notes/new" });
    push(distinctId, session, t + 1000, "created_note", { ...base, template: pick(["blank", "meeting", "todo", "journal"]) });

    if (rand() < 0.42) {
      t += rand() * 3 * 86400e3;
      session = crypto.randomUUID();
      push(distinctId, session, t, "shared_note", { ...base, channel: pick(["link", "email", "slack"]) });
    }
    if (rand() < 0.2) {
      t += rand() * 10 * 86400e3;
      session = crypto.randomUUID();
      push(distinctId, session, t - 30e3, "$pageview", { ...base, $current_url: "https://acmenotes.io/pricing", $pathname: "/pricing" });
      const plan = pick(PLANS, [50, 40, 10]);
      push(distinctId, session, t, "upgraded_plan", { ...base, plan, mrr: { starter: 9, pro: 29, business: 99 }[plan] });
      push(distinctId, session, t + 500, "$set", { $set: { plan } });
    }

    // Returning sessions: each later week has a decaying chance of activity, with a long-term floor.
    for (let week = 1; week <= 10; week++) {
      if (rand() > 0.42 * Math.pow(0.8, week - 1) + 0.07) continue;
      const at = t + week * 7 * 86400e3 + (rand() - 0.5) * 5 * 86400e3;
      if (at >= now) break;
      session = crypto.randomUUID();
      const n = 1 + Math.floor(rand() * 5);
      let st = at;
      for (let i = 0; i < n; i++) {
        const path = pick(APP);
        push(distinctId, session, st, "$pageview", { ...base, $current_url: `https://acmenotes.io${path}`, $pathname: path, $referrer: "$direct", $referring_domain: "$direct" });
        st += (10 + rand() * 120) * 1000;
      }
      if (rand() < 0.6) push(distinctId, session, st, "created_note", { ...base, template: pick(["blank", "meeting", "todo", "journal"]) });
    }
  }

  // Feed everything through the real ingestion processor so persons/sessions are built the same way.
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const BATCH = 2000;
  for (let i = 0; i < events.length; i += BATCH) {
    await processEvents(db, events.slice(i, i + BATCH));
    process.stdout.write(`\r• ingested ${Math.min(i + BATCH, events.length)}/${events.length} events`);
  }
  process.stdout.write("\n");

  // A starter dashboard
  const [dash] = await db
    .insert(schema.dashboards)
    .values({ projectId, name: "Product health", description: "Acquisition, activation and retention at a glance", createdBy: user!.id })
    .returning();
  const tiles: { name: string; config: InsightQueryInput }[] = [
    { name: "Daily active users", config: { type: "trend", series: [{ event: "$pageview", math: "unique" }], interval: "day", dateRange: "30d" } },
    { name: "Signups by source", config: { type: "trend", series: [{ event: "signed_up" }], breakdown: "$referring_domain", interval: "week", dateRange: "90d", chart: "bar" } },
    { name: "Activation funnel", config: { type: "funnel", steps: [{ event: "signed_up" }, { event: "created_note" }, { event: "shared_note" }, { event: "upgraded_plan" }], windowDays: 14, dateRange: "30d" } },
    { name: "Weekly retention", config: { type: "retention", startEvent: "signed_up", returnEvent: "$pageview", period: "week", periods: 8, dateRange: "90d" } },
  ];
  await db.insert(schema.insights).values(
    tiles.map((t, position) => ({
      projectId,
      dashboardId: dash!.id,
      name: t.name,
      type: t.config.type,
      config: t.config as Record<string, unknown>,
      position,
      createdBy: user!.id,
    })),
  );

  console.log(`✔ done — sign in at ${process.env.APP_URL ?? "http://localhost:3000"} as ${EMAIL} / ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
