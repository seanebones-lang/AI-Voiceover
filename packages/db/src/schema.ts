import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

export const orgRoleEnum = pgEnum("org_role", [
  "org_admin",
  "org_member",
  "org_billing",
  "org_viewer",
])

export const jobStatusEnum = pgEnum("voice_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
])

export const jobTypeEnum = pgEnum("voice_job_type", ["tts", "clone", "transcode"])

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "canceled",
  "trialing",
  "incomplete",
  "unpaid",
])

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_clerk_idx").on(t.clerkUserId)]
)

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkOrgId: text("clerk_org_id").notNull().unique(),
    name: text("name").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("orgs_clerk_idx").on(t.clerkOrgId)]
)

export const orgMembers = pgTable(
  "org_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRoleEnum("role").notNull().default("org_member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("org_members_org_user").on(t.orgId, t.userId),
    index("org_members_user_idx").on(t.userId),
  ]
)

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("projects_org_idx").on(t.orgId)]
)

export const voiceJobs = pgTable(
  "voice_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    type: jobTypeEnum("type").notNull(),
    status: jobStatusEnum("status").notNull().default("queued"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    errorMessage: text("error_message"),
    bullmqJobId: text("bullmq_job_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("voice_jobs_org_idx").on(t.orgId), index("voice_jobs_status_idx").on(t.status)]
)

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id").notNull().unique(),
    stripePriceId: text("stripe_price_id"),
    status: subscriptionStatusEnum("status").notNull(),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscriptions_org_idx").on(t.orgId)]
)

export const entitlements = pgTable(
  "entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    featureKey: text("feature_key").notNull(),
    value: jsonb("value").$type<unknown>().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entitlements_org_feature").on(t.orgId, t.featureKey)]
)

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("api_keys_org_idx").on(t.orgId)]
)

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    resourceType: text("resource_type"),
    resourceId: text("resource_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_logs_org_idx").on(t.orgId),
    index("audit_logs_created_idx").on(t.createdAt),
  ]
)

export const stripeWebhookEvents = pgTable(
  "stripe_webhook_events",
  {
    id: text("id").primaryKey(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
    payloadHash: text("payload_hash"),
  }
)
