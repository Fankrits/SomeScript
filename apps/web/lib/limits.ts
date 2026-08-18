import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  subscriptions,
  workspaces,
  projects,
  creditBalances,
  creditTransactions,
} from "@/db/schema";
import { eq, and, ne, count } from "drizzle-orm";
import { PLAN_LIMITS, PERSONAL_WORKSPACE_CREDITS, maxMembersFor, type Plan } from "@/lib/plans";
import { nextPeriodResetAt } from "@/lib/credits";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERIOD_MS = 30 * MS_PER_DAY;

/** Syncs this workspace's Clerk org member cap to match its current plan. */
export async function syncWorkspaceMemberLimit(workspaceId: string, plan: Plan): Promise<void> {
  const client = await clerkClient();
  await client.organizations.updateOrganization(workspaceId, {
    maxAllowedMemberships: maxMembersFor(plan),
  });
}

/**
 * True for the owner's personal workspace (id === ownerId, always free — it isn't
 * a discretionary "create a workspace" decision) or their first *organization*.
 * Every organization after that is not free-eligible: it must be paid for.
 */
async function isFreeEligibleWorkspace(workspaceId: string, ownerId: string): Promise<boolean> {
  if (workspaceId === ownerId) return true;

  const [otherOrg] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.ownerId, ownerId),
        ne(workspaces.id, ownerId),
        ne(workspaces.id, workspaceId),
      ),
    )
    .limit(1);
  return !otherOrg;
}

/** `db`, or a transaction handle from `db.transaction()` — both satisfy the calls below. */
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * The allowance this workspace is due each period. Free personal workspaces get the
 * reduced solo grant; everything else gets its plan's figure. The ownerId lookup is
 * why this is only called once a reset is actually due, not on every read.
 */
async function monthlyGrantFor(
  workspaceId: string,
  plan: Plan,
  executor: Executor,
): Promise<number> {
  if (plan !== "free") return PLAN_LIMITS[plan].monthlyAiCredits;

  const workspace = await executor.query.workspaces.findFirst({
    where: eq(workspaces.id, workspaceId),
  });
  return workspace?.ownerId === workspaceId
    ? PERSONAL_WORKSPACE_CREDITS
    : PLAN_LIMITS.free.monthlyAiCredits;
}

/**
 * Refills the monthly AI allowance if the period has elapsed.
 *
 * Lazy-on-read rather than a cron: it's O(1) per *active* workspace instead of a
 * nightly sweep of every workspace, needs no cron entry or authenticated cron
 * endpoint, and it covers free workspaces — which have no Stripe subscription and
 * so no invoice event that could ever have triggered a refill. Callers run it
 * before reading or spending a balance.
 *
 * `purchasedBalance` is deliberately untouched: top-ups are paid for and carry
 * over, which is the distinction the two-pool schema exists to express.
 */
export async function applyMonthlyReset(
  workspaceId: string,
  plan: Plan,
  executor: Executor = db,
): Promise<void> {
  const balance = await executor.query.creditBalances.findFirst({
    where: eq(creditBalances.workspaceId, workspaceId),
  });
  // No row yet: nothing has been spent, so the plan default already applies (see
  // defaultIncludedBalance in the credits route). Seeding one here would race the
  // upsert paths for no benefit.
  if (!balance) return;

  const now = new Date();
  if (now < balance.periodResetAt) return;

  const grant = await monthlyGrantFor(workspaceId, plan, executor);
  await executor
    .update(creditBalances)
    .set({
      includedBalance: grant,
      periodResetAt: nextPeriodResetAt(balance.periodResetAt, now),
      updatedAt: now,
    })
    .where(eq(creditBalances.workspaceId, workspaceId));

  await executor.insert(creditTransactions).values({
    workspaceId,
    delta: grant - balance.includedBalance,
    reason: "monthly_grant",
    description: `Monthly ${plan} allowance: ${grant} credits`,
  });
}

/**
 * Seeds a newly created workspace's subscription + credit rows. The owner's first
 * workspace (personal, or first organization) starts free and active. Every
 * organization after that is born *locked* — a real "pro" subscription row in
 * "past_due" status, with no credit grant — rather than blocking its creation
 * outright: Clerk's org-creation gate runs before this workspace even exists, so
 * there's no workspace yet to attach a paid subscription to. Letting it exist but
 * locked gives checkout somewhere to attach to; assertWorkspaceActive keeps it
 * unusable until that checkout completes. Both the Clerk webhook (organization.created)
 * and ensureWorkspaceExists (the local-dev fallback) call this — one place, so the
 * free/locked decision can't drift between the two creation paths.
 */
export async function seedWorkspaceDefaults(workspaceId: string, ownerId: string): Promise<void> {
  const isFree = await isFreeEligibleWorkspace(workspaceId, ownerId);
  const isPersonal = workspaceId === ownerId;

  await db
    .insert(subscriptions)
    .values(isFree ? { workspaceId } : { workspaceId, plan: "pro", status: "past_due" })
    .onConflictDoNothing();

  // A personal workspace has no membership mechanism at all, so it can't be the
  // collaborative free tier — it gets a reduced solo grant, and the full free
  // allowance belongs to the one free organization. See PERSONAL_WORKSPACE_CREDITS.
  const grant = isPersonal ? PERSONAL_WORKSPACE_CREDITS : PLAN_LIMITS.free.monthlyAiCredits;

  await db
    .insert(creditBalances)
    .values({
      workspaceId,
      includedBalance: isFree ? grant : 0,
      periodResetAt: new Date(Date.now() + PERIOD_MS),
    })
    .onConflictDoNothing();

  // Only meaningful for the free case: a locked workspace is already blocked from
  // all real use by assertWorkspaceActive and gets its real member cap set by the
  // Stripe webhook once checkout completes. Skip entirely for personal workspaces
  // (workspaceId === ownerId) — there's no Clerk organization to update there.
  if (isFree && !isPersonal) {
    await syncWorkspaceMemberLimit(workspaceId, "free");
  }
}

/**
 * Personal (non-org) workspaces never get a `subscriptions` row — there's no Clerk
 * org-creation event to hook for them — so no row means free/active, not an error.
 */
export async function getWorkspaceSubscription(
  workspaceId: string,
): Promise<{ plan: Plan; status: "active" | "trialing" | "past_due" | "canceled" }> {
  const sub = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.workspaceId, workspaceId),
  });
  return { plan: sub?.plan ?? "free", status: sub?.status ?? "active" };
}

/** Throws once the workspace is at its plan's project cap. */
export async function assertProjectLimit(workspaceId: string): Promise<void> {
  const { plan } = await getWorkspaceSubscription(workspaceId);
  const max = PLAN_LIMITS[plan].maxProjects;
  if (max === Infinity) return;

  const [row] = await db
    .select({ n: count() })
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId));
  if ((row?.n ?? 0) >= max) {
    throw new Error(`Free plan is limited to ${max} projects per workspace. Upgrade to add more.`);
  }
}

/**
 * Throws when a non-free workspace isn't in good standing — either it lapsed
 * (payment failed on a previously active subscription) or it was born locked (a
 * 2nd+ owned organization, seeded by seedWorkspaceDefaults with no checkout yet).
 * Data stays either way; writes stop until checkout completes, or the plan is
 * canceled back down to free. A clean cancellation always pairs status "canceled"
 * with plan "free" (see the Stripe webhook), so this only ever fires on `past_due`,
 * not on that combination.
 */
export async function assertWorkspaceActive(workspaceId: string): Promise<void> {
  const { plan, status } = await getWorkspaceSubscription(workspaceId);
  if (plan === "free") return;
  if (status === "past_due" || status === "canceled") {
    throw new Error(
      "This workspace needs an active Pro or Team subscription. Upgrade to continue.",
    );
  }
}
