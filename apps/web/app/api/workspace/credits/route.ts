import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { creditBalances, creditTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceSubscription } from "@/lib/limits";
import { MODE_ACCESS_BY_PLAN, PLAN_LIMITS, type EveMode, type Plan } from "@/lib/plans";
import { computeCreditCost, drainCredits } from "@/lib/credits";

function isEveMode(v: unknown): v is EveMode {
  return v === "lite" || v === "pro" || v === "expert";
}

// No credit_balances row yet means untouched, not exhausted — same convention the
// dashboard and billing panel use (rows are seeded lazily). But only for a workspace
// in good standing (mirrors assertWorkspaceActive): a paid plan that's past_due/canceled
// with no row must default to 0, not its paid allotment, or a lapsed workspace whose
// seed happened to be skipped gets free paid-tier usage instead of being blocked.
function defaultIncludedBalance(plan: Plan, status: string): number {
  const inGoodStanding = plan === "free" || status === "active" || status === "trialing";
  return inGoodStanding ? PLAN_LIMITS[plan].monthlyAiCredits : 0;
}

export async function GET(): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = orgId || userId;

  const { plan, status } = await getWorkspaceSubscription(workspaceId);
  const balance = await db.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) });

  return Response.json({
    includedBalance: balance?.includedBalance ?? defaultIncludedBalance(plan, status),
    purchasedBalance: balance?.purchasedBalance ?? 0,
    plan,
    allowedModes: MODE_ACCESS_BY_PLAN[plan],
  });
}

/**
 * Records AI usage against the workspace's credit balance. This runs *after* a
 * turn has already executed (the caller reports real output tokens), so it never
 * refuses — it can only record what was spent, including into negative balance
 * (an overage signal a future turn's pre-flight check reacts to). Rejecting usage
 * belongs to the caller, before it sends the turn — this endpoint just accounts.
 */
export async function POST(req: Request): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = orgId || userId;

  const body = await req.json().catch(() => null);
  const mode = body?.mode;
  const outputTokens = Number(body?.outputTokens);
  if (!isEveMode(mode) || !Number.isFinite(outputTokens) || outputTokens <= 0) {
    return Response.json({ error: "Invalid mode or outputTokens" }, { status: 400 });
  }

  const cost = computeCreditCost(mode, outputTokens);
  const { plan, status } = await getWorkspaceSubscription(workspaceId);

  await db.transaction(async (tx) => {
    const balance = await tx.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) });
    const { newIncluded, newPurchased } = drainCredits(
      balance?.includedBalance ?? defaultIncludedBalance(plan, status),
      balance?.purchasedBalance ?? 0,
      cost,
    );

    // No row yet: a bare UPDATE would match zero rows and silently drop the
    // deduction (the same bug creditTopUp in the Stripe webhook already had to fix
    // for purchases). Upsert instead, seeded from the same plan-default fallback
    // GET uses, so creating the row here can't regress what the workspace already had.
    await tx
      .insert(creditBalances)
      .values({
        workspaceId,
        includedBalance: newIncluded,
        purchasedBalance: newPurchased,
        periodResetAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoUpdate({
        target: creditBalances.workspaceId,
        set: { includedBalance: newIncluded, purchasedBalance: newPurchased, updatedAt: new Date() },
      });

    await tx.insert(creditTransactions).values({
      workspaceId,
      delta: -cost,
      reason: "usage",
      description: `Eve (${mode}): ${outputTokens} output tokens`,
    });
  });

  return Response.json({ ok: true, cost });
}
