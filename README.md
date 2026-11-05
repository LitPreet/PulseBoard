# PulseBoard

**Lightweight, self-hostable product analytics for small SaaS teams** — a focused alternative to PostHog / Mixpanel.

Drop a 3 kB script on your site and get a live event stream, trends, funnels, retention cohorts, sessions and shareable dashboards, backed by Postgres and Redis.

![Next.js](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791) ![Redis](https://img.shields.io/badge/Redis-Streams-dc382d)

## Features

- **JS SDK** (2.9 kB gzipped): automatic pageviews including SPA navigation, `capture`, `identify`, `reset`, super properties, offline queue with retry, `sendBeacon` on page close, UTM capture, opt-out.
- **Live events**: events appear in the UI about a second after they're sent, via Server-Sent Events.
- **Trends**: total or unique-user counts by hour, day, week or month, with property filters and breakdowns.
- **Funnels**: ordered multi-step funnels with a conversion window, drop-off and average time to convert.
- **Retention**: daily or weekly cohort heatmaps.
- **Sessions**: duration, pages, bounce rate and device, plus a per-session event timeline.
- **Dashboards**: save any insight as a tile. A dashboard-wide date filter re-runs every tile.
- **Teams**: organizations, projects, invite links, and owner/admin/member/viewer roles.
- **API keys**: a public write-only key for the SDK, and secret keys (shown once, stored hashed) for the server-side query API.

## Architecture

```
Browser SDK ──POST /api/v1/capture──▶ Next.js ──XADD──▶ Redis Stream ──▶ Worker ──▶ PostgreSQL
                                     (validate, rate-limit)          (consumer group)   ▲
                                                                       │ PUBLISH       │ SQL
Dashboard UI ◀──── SSE /live ◀──── Redis pub/sub ◀────────────────────┘        Next.js server components
```

- **The ingestion path never touches Postgres.** The endpoint validates the payload (zod), resolves the key from a Redis cache, rate-limits, then appends to a Redis Stream. That keeps traffic spikes away from the database.
- **The worker** reads from a consumer group in batches. It resolves people, merging anonymous visitors into identified users on `$identify`, builds session rollups, bulk-inserts events, and publishes them to the live stream. If a worker crashes, its unacknowledged messages are picked up again with `XAUTOCLAIM`. A message that keeps failing is moved to a dead-letter stream.
- **At-least-once delivery is safe.** The SDK gives each event a client-side UUIDv7, so inserts use `ON CONFLICT DO NOTHING` and session counters only move for rows actually inserted.
- **Analytics run as parameterized SQL** (Drizzle `sql` templates) in `packages/core/src/analytics`, isolated from the rest of the code so the backend could be swapped for ClickHouse later.

See [PLAN.md](PLAN.md) for the full design.

## Quick start

Requires Node 20.9+ and Docker.

```bash
cp .env.example .env
cp .env apps/web/.env.local
docker compose up -d          # Postgres 17 + Redis 7
npm install
npm run db:migrate
npm run seed                  # demo workspace with ~60 days of data
npm run dev                   # web on :3000 + worker
```

Sign in at http://localhost:3000 as **demo@pulseboard.dev / demo1234**, or create your own account.

To watch live events, open `http://localhost:3000/demo.html?key=pk_demo_0000000000000000` in another tab and click around.

## Using the SDK

```html
<script src="https://your-pulseboard.example.com/sdk.js"></script>
<script>
  pulseboard.init("pk_...", { apiHost: "https://your-pulseboard.example.com" });
</script>
```

```js
pulseboard.capture("signed_up", { plan: "pro" });
pulseboard.identify(user.id, { email: user.email }); // links earlier anonymous activity
pulseboard.register({ app_version: "2.3.0" });       // sent with every event
pulseboard.reset();                                  // on logout
```

## Query API

Create a secret key under **Project & API keys**, then:

```bash
curl -X POST http://localhost:3000/api/v1/query \
  -H "Authorization: Bearer sk_..." -H "Content-Type: application/json" \
  -d '{"query":{"type":"funnel","steps":[{"event":"signed_up"},{"event":"upgraded_plan"}],"windowDays":14,"dateRange":"30d"}}'
```

`query.type` is one of `trend`, `funnel` or `retention`. The schemas are in [packages/core/src/analytics/types.ts](packages/core/src/analytics/types.ts).

## Project layout

```
apps/web        Next.js App Router: UI, auth, ingestion + query APIs, SSE
apps/worker     Redis Streams consumer
packages/core   Drizzle schema & migrations, ingestion processor, analytics queries
packages/sdk    Browser SDK (ESM + script-tag builds)
scripts/seed.ts Demo data generator (goes through the real ingestion processor)
```

## Testing

```bash
npm test        # Vitest: ingestion, identity merging, trends, funnels, retention, sessions, SDK
npm run build   # SDK + Next.js production build
```

The database tests run against **PGlite** (real Postgres compiled to WASM) with the real migrations applied, so CI needs no Docker. The SDK tests run in happy-dom and check that the SDK's payloads pass the server's own validator.

## Roadmap

Monthly partitioning of `events`, a ClickHouse backend, materialized daily rollups, property-key discovery, saved cohorts, path analysis, alerts.
