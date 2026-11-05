# PulseBoard — Build Plan

A lightweight, self-hostable product analytics platform (think PostHog/Mixpanel, sized for small SaaS teams).

## 1. Goals

| Feature | What "done" means |
|---|---|
| JS SDK | `pulseboard.init(key)` → auto pageviews (incl. SPA navigation), `capture`, `identify`, `reset`, super properties, batching, offline queue + retry, `sendBeacon` on unload |
| Ingestion | Public HTTP endpoint that validates, rate-limits and enqueues events in < 5 ms; never touches Postgres on the hot path |
| Live stream | Events show up in the UI within ~1 s of being sent (SSE) |
| Trends | Event counts / unique users over time, hour/day/week/month buckets, property breakdown + filters |
| Funnels | Ordered multi-step funnels with a conversion window; per-step conversion, drop-off, avg time-to-convert |
| Retention | Cohort table (day/week), start event → return event |
| Sessions | Session list with duration, pages, bounce, device/browser; session timeline view |
| Dashboards | Save any insight to a dashboard; dashboard-level date filter re-runs every tile |
| Accounts | Email/password auth, organizations, projects, team invites, roles (owner/admin/member/viewer), secret API keys for a query API |

Non-goals (v1): session replay, feature flags, A/B testing, ClickHouse, SSO, billing.

## 2. Architecture

```
 Browser (SDK) ──POST /api/v1/capture──▶  Next.js (apps/web)
                                            │ validate (zod) + project lookup (Redis cache) + rate limit
                                            ▼
                                     Redis Stream  "pb:events"
                                            │  consumer group "ingest"
                                            ▼
                                   Worker (apps/worker)
                    resolve persons/aliases · upsert sessions · bulk insert events
                    update event definitions · PUBLISH pb:live:<projectId>
                                            │
                                            ▼
                                       PostgreSQL ◀──── Next.js dashboard (Server Components,
                                                          analytics SQL in packages/core)
        Redis pub/sub pb:live:<projectId> ──▶ SSE /api/projects/:id/live ──▶ Live events UI
```

**Why this shape**
- *Queue between ingest and DB*: traffic spikes don't hit Postgres; worker batches inserts (hundreds of rows per round-trip) and can be scaled horizontally via the consumer group. Unacked messages are reclaimed with `XAUTOCLAIM`, so a crashed worker loses nothing.
- *Redis Streams over a job library*: an event is not a "job"; streams give ordered, batched, at-least-once delivery with no extra abstraction. Client-generated event UUIDs + `ON CONFLICT DO NOTHING` make redelivery idempotent.
- *Postgres for analytics*: totally fine up to tens of millions of events with the right composite indexes; funnels/retention are expressed as CTEs. The query layer is isolated in `packages/core/analytics` so it can be swapped for ClickHouse later.

## 3. Repo layout (npm workspaces)

```
apps/
  web/        Next.js App Router — UI, auth, ingestion API, query API, SSE
  worker/     Node process — consumes the Redis stream
packages/
  core/       Drizzle schema + migrations, DB client, analytics queries, ingestion processor, shared zod schemas
  sdk/        Browser SDK (ESM + IIFE bundle served as /sdk.js)
scripts/      seed demo data
docker-compose.yml   Postgres 17 + Redis 7
```

## 4. Data model

- `users`, `auth_sessions` (hashed tokens), `organizations`, `memberships(role)`, `invites`
- `projects` (with public write key `pk_…`), `api_keys` (secret `sk_…`, stored as SHA-256 hash + prefix)
- `persons`, `person_distinct_ids` (anonymous → identified merge)
- `events` (uuid PK from client, `project_id`, `event`, `distinct_id`, `person_id`, `session_id`, `timestamp`, `properties jsonb`)
  - indexes: `(project_id, timestamp)`, `(project_id, event, timestamp)`, `(project_id, person_id, timestamp)`, `(project_id, session_id)`
- `sessions` (aggregated by the worker: start/end, counts, entry/exit URL, browser/OS/device, referrer)
- `event_definitions` (event names + volume, powers pickers)
- `dashboards`, `insights` (type + JSON config)

## 5. Analytics query design

- **Trends**: `generate_series` buckets left-joined to `date_trunc` counts (zero-filled); math = total or unique persons; optional breakdown by a property (top 10 values).
- **Funnels**: one CTE per step. Step 1 = each person's first occurrence in range; step *n* = first occurrence of event *n* after step *n-1* and within `t0 + window`. Counts + avg time between steps come from the same CTE chain.
- **Retention**: cohort = period of a person's first-ever start event (inside the range); return = distinct periods in which they did the return event; offset = period difference.
- **Sessions**: precomputed rows, so listing/stats are plain indexed queries.
- All queries are parameterized (Drizzle `sql` template) — property keys/values are bound, never interpolated.

## 6. Security & roles

| Role | Can |
|---|---|
| viewer | view analytics & dashboards |
| member | + create/edit insights and dashboards |
| admin | + manage projects, API keys, invite members |
| owner | + change roles, remove members |

- Passwords: `scrypt` (node:crypto). Sessions: random 32-byte token in an httpOnly cookie, only the hash stored.
- Public key (`pk_`) can only write events. Secret keys (`sk_`) are shown once, hashed at rest, project-scoped, revocable.
- Ingestion is CORS-open, size-limited and rate-limited per key (Redis fixed window).

## 7. Phases

1. **Scaffold** — workspaces, TS config, docker-compose, Drizzle schema + first migration.
2. **Accounts** — auth, orgs, projects, invites, roles, API keys, app shell.
3. **Ingestion** — capture endpoint, Redis stream, worker, person merge, sessions, live pub/sub.
4. **SDK** — browser SDK + build that publishes `/sdk.js`, demo page.
5. **Analytics engine** — trends/funnels/retention/sessions queries, tested against an in-process Postgres (PGlite).
6. **Product UI** — overview, live events, insights, funnels, retention, sessions, dashboards with date filters, query API.
7. **Polish** — demo seed script, README.

Status: all seven phases are implemented and verified end to end (Docker Postgres + Redis, real HTTP ingestion, headless-browser checks of every page).

## 8. Testing strategy

- Vitest + PGlite (real Postgres compiled to WASM) runs migrations and exercises the ingestion processor and every analytics query on fixture data — no Docker needed for CI.
- `next build` + `tsc --noEmit` across workspaces as the type/compile gate.

## 9. Later (v2 ideas)

Monthly partitioning of `events`, ClickHouse backend, materialized daily rollups, property-key discovery, cohorts, path analysis, alerts, session replay.
