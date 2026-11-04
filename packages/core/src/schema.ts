import {
  bigint,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const insightTypeEnum = pgEnum("insight_type", ["trend", "funnel", "retention"]);

// ─── Accounts ──────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

export const authSessions = pgTable(
  "auth_sessions",
  {
    /** sha256 of the cookie token — the raw token is never stored */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull().default("member"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: roleEnum("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull().unique(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("invites_org_idx").on(t.orgId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** Public write-only key embedded in the SDK snippet */
    publicKey: text("public_key").notNull().unique(),
    createdAt: createdAt(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)],
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters of the key, safe to display (e.g. "sk_4f2a…") */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull().unique(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_project_idx").on(t.projectId)],
);

// ─── Analytics data ────────────────────────────────────────────────────────

export const persons = pgTable(
  "persons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),
    isIdentified: integer("is_identified").notNull().default(0),
  },
  (t) => [index("persons_project_idx").on(t.projectId, t.lastSeen)],
);

export const personDistinctIds = pgTable(
  "person_distinct_ids",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    distinctId: text("distinct_id").notNull(),
    personId: uuid("person_id")
      .notNull()
      .references(() => persons.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.distinctId] }),
    index("person_distinct_ids_person_idx").on(t.personId),
  ],
);

export const events = pgTable(
  "events",
  {
    /** Client-generated UUID — makes at-least-once delivery idempotent */
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    distinctId: text("distinct_id").notNull(),
    personId: uuid("person_id").notNull(),
    sessionId: text("session_id"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    properties: jsonb("properties").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("events_project_ts_idx").on(t.projectId, t.timestamp),
    index("events_project_event_ts_idx").on(t.projectId, t.event, t.timestamp),
    index("events_project_person_ts_idx").on(t.projectId, t.personId, t.timestamp),
    index("events_project_session_idx").on(t.projectId, t.sessionId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    id: text("id").notNull(),
    personId: uuid("person_id").notNull(),
    distinctId: text("distinct_id").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    eventCount: integer("event_count").notNull().default(0),
    pageviewCount: integer("pageview_count").notNull().default(0),
    entryUrl: text("entry_url"),
    exitUrl: text("exit_url"),
    referrer: text("referrer"),
    browser: text("browser"),
    os: text("os"),
    deviceType: text("device_type"),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.id] }),
    index("sessions_project_started_idx").on(t.projectId, t.startedAt),
    index("sessions_project_person_idx").on(t.projectId, t.personId),
  ],
);

export const eventDefinitions = pgTable(
  "event_definitions",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    volume: bigint("volume", { mode: "number" }).notNull().default(0),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.name] })],
);

// ─── Dashboards ────────────────────────────────────────────────────────────

export const dashboards = pgTable(
  "dashboards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("dashboards_project_idx").on(t.projectId)],
);

export const insights = pgTable(
  "insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    dashboardId: uuid("dashboard_id").references(() => dashboards.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: insightTypeEnum("type").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    position: integer("position").notNull().default(0),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    index("insights_project_idx").on(t.projectId),
    index("insights_dashboard_idx").on(t.dashboardId, t.position),
  ],
);

export type Role = (typeof roleEnum.enumValues)[number];
export type InsightType = (typeof insightTypeEnum.enumValues)[number];

