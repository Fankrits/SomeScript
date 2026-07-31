import { pgTable, text, timestamp, uuid, index, integer, pgEnum, jsonb, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk User ID
  email: text("email").notNull().unique(),
  name: text("name"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(), // Clerk Organization ID (or personal user ID for personal workspace)
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  imageUrl: text("image_url"),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    workspaceId: text("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("projects_workspace_id_idx").on(table.workspaceId)]
);

export const subscriptionPlanEnum = pgEnum("subscription_plan", ["free", "pro", "team"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
]);

export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: text("workspace_id")
    .references(() => workspaces.id, { onDelete: "cascade" })
    .notNull()
    .unique(),
  plan: subscriptionPlanEnum("plan").notNull().default("free"),
  status: subscriptionStatusEnum("status").notNull().default("active"),
  seats: integer("seats"), // per-seat count for "team" plan; null for free/pro
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  currentPeriodEnd: timestamp("current_period_end"),
  cancelAtPeriodEnd: timestamp("cancel_at_period_end"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Two pools because they don't behave the same at renewal: `includedBalance` is the
// plan's monthly AI allowance and resets to PLAN_LIMITS[plan].monthlyAiCredits each
// period; `purchasedBalance` is paid top-ups and carries over untouched. Spend drains
// includedBalance first, then purchasedBalance.
export const creditBalances = pgTable("credit_balances", {
  workspaceId: text("workspace_id")
    .primaryKey()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  includedBalance: integer("included_balance").notNull().default(0),
  purchasedBalance: integer("purchased_balance").notNull().default(0),
  periodResetAt: timestamp("period_reset_at").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creditTransactionReasonEnum = pgEnum("credit_transaction_reason", [
  "monthly_grant",
  "purchase",
  "usage",
  "adjustment",
]);

export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: text("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),
    delta: integer("delta").notNull(), // positive: grant/purchase, negative: usage
    reason: creditTransactionReasonEnum("reason").notNull(),
    description: text("description"), // e.g. "Eve chat completion", "Stripe top-up pack_2000"
    // Stripe redelivers webhook events on retry; dedupe purchase/grant rows against
    // event.id via onConflictDoNothing so a redelivery can't double-credit a balance.
    // Null for reasons that don't originate from a Stripe event (usage, adjustment).
    stripeEventId: text("stripe_event_id").unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("credit_transactions_workspace_id_idx").on(table.workspaceId)]
);

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
  filePath: text("file_path").notNull(), // relative path, e.g., "main.tex"
  storageKey: text("storage_key").notNull(), // e.g. "projects/project-uuid/main.tex"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Durable backing store for Eve chat threads, mirroring the shape already
// persisted client-side to localStorage (see apps/editor/lib/thread-history.ts)
// so the sync layer is a straight passthrough, not a reshape. `id` is the
// client-generated threadId (crypto.randomUUID()), not server-assigned —
// defaultRandom() only covers the (unused) case of a server-side insert.
// The local sandbox project ("default", not a real uuid) never reaches this
// table — requireProject() in apps/editor/lib/authz.ts rejects it outside
// project ownership, so those threads stay localStorage-only, same as today.
export const chatThreads = pgTable(
  "chat_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }).notNull(),
    title: text("title").notNull().default("New Chat"),
    events: jsonb("events").notNull().default([]),
    sessionState: jsonb("session_state"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("chat_threads_project_id_idx").on(table.projectId)]
);

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    category: text("category").notNull().default("General"),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name"),
    authorAvatarUrl: text("author_avatar_url"),
    usageCount: integer("usage_count").notNull().default(0),
    isPublic: boolean("is_public").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [index("templates_is_public_idx").on(table.isPublic)]
);

