import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { creditBalances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getWorkspaceSubscription } from "@/lib/limits";
import { PLAN_LIMITS } from "@/lib/plans";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const workspaceId = orgId || userId;

  const { plan, status } = await getWorkspaceSubscription(workspaceId);
  const workspaceLocked = plan !== "free" && status !== "active" && status !== "trialing";

  const creditBalance = await db.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) });
  const credits = creditBalance
    ? creditBalance.includedBalance + creditBalance.purchasedBalance
    : PLAN_LIMITS[plan].monthlyAiCredits;

  return (
    <DashboardSidebar
      plan={plan}
      credits={credits}
      workspaceLocked={workspaceLocked}
    >
      {children}
    </DashboardSidebar>
  );
}
