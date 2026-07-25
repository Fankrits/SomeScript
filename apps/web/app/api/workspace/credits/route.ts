import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { creditBalances, creditTransactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getWorkspaceSubscription } from "@/lib/limits";
import { MODE_ACCESS_BY_PLAN, type EveMode } from "@/lib/plans";
import { computeCreditCost, drainCredits } from "@/lib/credits";

function isEveMode(v: unknown): v is EveMode {
  return v === "lite" || v === "pro" || v === "expert";
}

export async function GET(): Promise<Response> {
  const { userId, orgId } = await auth();
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const workspaceId = orgId || userId;

  const { plan } = await getWorkspaceSubscription(workspaceId);
  const balance = await db.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) });

  return Response.json({
    includedBalance: balance?.includedBalance ?? 0,
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

  await db.transaction(async (tx) => {
    const balance = await tx.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) });
    const { newIncluded, newPurchased } = drainCredits(
      balance?.includedBalance ?? 0,
      balance?.purchasedBalance ?? 0,
      cost,
    );

    await tx
      .update(creditBalances)
      .set({ includedBalance: newIncluded, purchasedBalance: newPurchased, updatedAt: new Date() })
      .where(eq(creditBalances.workspaceId, workspaceId));

    await tx.insert(creditTransactions).values({
      workspaceId,
      delta: -cost,
      reason: "usage",
      description: `Eve (${mode}): ${outputTokens} output tokens`,
    });
  });

  return Response.json({ ok: true, cost });
}
