import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { creditBalances } from "@/db/schema";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { CreditCard, Folder } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { BillingPanel } from "@/components/billing-panel";
import { getWorkspaceSubscription } from "@/lib/limits";
import { PLAN_LIMITS } from "@/lib/plans";

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", team: "Team" };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const workspaceId = orgId || userId;

  // 2nd+ owned organization is seeded locked (see seedWorkspaceDefaults) — surface
  // that as an upgrade prompt here rather than only on the first blocked action.
  const { plan, status } = await getWorkspaceSubscription(workspaceId);
  const workspaceLocked = plan !== "free" && status !== "active" && status !== "trialing";

  // No row yet (workspace never touched a project/webhook) means an untouched
  // free allotment, not zero — mirrors getWorkspaceSubscription's "no row = free" rule.
  const creditBalance = await db.query.creditBalances.findFirst({ where: eq(creditBalances.workspaceId, workspaceId) });
  const credits = creditBalance
    ? creditBalance.includedBalance + creditBalance.purchasedBalance
    : PLAN_LIMITS[plan].monthlyAiCredits;

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* 1. Sidebar (Left Panel) */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col justify-between p-6">
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <Image src="/logo.svg" alt="SomeScript Logo" width={32} height={32} className="h-8 w-8 -mr-1" />
            <span className="font-semibold text-base tracking-tight text-foreground">
              SomeScript
            </span>
          </div>

          {/* Workspace Select Dropdown */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
                Active Workspace
              </span>
              <Badge variant={plan === "free" ? "outline" : "default"} className="uppercase">
                {PLAN_LABEL[plan] ?? plan}
              </Badge>
            </div>
            <div className="rounded-lg border border-sidebar-border bg-card p-1 flex items-center justify-between shadow-sm">
              <OrganizationSwitcher
                fallback={
                  <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                    <Skeleton className="h-6 w-6 rounded-md" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                }
                hidePersonal={false}
                afterCreateOrganizationUrl="/dashboard"
                afterLeaveOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                afterSelectPersonalUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger: "w-full flex items-center justify-between text-foreground hover:bg-secondary/40 px-2 py-1.5 rounded-lg text-sm transition-all border-none bg-transparent font-medium",
                    organizationPreview: "w-full",
                  },
                }}
              >
                <OrganizationSwitcher.OrganizationProfilePage
                  label="Billing"
                  url="billing"
                  labelIcon={<CreditCard className="h-4 w-4" />}
                >
                  <BillingPanel />
                </OrganizationSwitcher.OrganizationProfilePage>
              </OrganizationSwitcher>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex flex-col gap-1.5 mt-2">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider px-1 mb-1">
              Navigation
            </span>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all bg-primary/10 text-primary border border-primary/10"
            >
              <Folder className="h-4 w-4" />
              Projects
            </Link>
          </nav>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-3 text-sm">
            <span className="text-muted-foreground">AI credits</span>
            <span className="font-semibold text-foreground">{credits.toLocaleString()}</span>
          </div>

          <UpgradeDialog autoOpenLocked={workspaceLocked} />

          {/* User Info / Profile Avatar */}
          <div className="border-t border-sidebar-border pt-6 flex items-center gap-3">
            <UserButton
              fallback={
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-8 rounded-full" />
                </div>
              }
              appearance={{
                elements: {
                  userButtonBox: "flex flex-row-reverse gap-3 items-center w-full",
                  userButtonOuterIdentifier: "text-muted-foreground font-medium text-sm text-left truncate max-w-[120px] hover:text-primary transition-colors",
                },
              }}
              showName
            />
          </div>
        </div>
      </aside>

      {/* 2. Main Content Panel */}
      {children}
    </div>
  );
}
