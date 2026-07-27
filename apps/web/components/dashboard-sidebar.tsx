"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { CreditCard, Folder, Menu, X, PanelLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { UpgradeDialog } from "@/components/upgrade-dialog";
import { BillingPanel } from "@/components/billing-panel";

const PLAN_LABEL: Record<string, string> = { free: "Free", pro: "Pro", team: "Team" };

interface DashboardSidebarProps {
  plan: string;
  credits: number;
  workspaceLocked: boolean;
  children: React.ReactNode;
}

export function DashboardSidebar({
  plan,
  credits,
  workspaceLocked,
  children,
}: DashboardSidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarContent = (
    <div className="flex flex-col h-full justify-between">
      <div className="flex flex-col gap-6 sm:gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-1.5 hover:opacity-90 transition-opacity">
          <Image src="/logo.svg" alt="SomeScript Logo" width={32} height={32} className="h-8 w-8 -mr-1" />
          <span className="font-semibold text-base tracking-tight text-foreground">
            SomeScript
          </span>
        </Link>

        {/* Workspace Select Dropdown */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider">
              Active Workspace
            </span>
            <Badge variant={plan === "free" ? "outline" : "default"} className="uppercase text-[9px] px-1.5 py-0">
              {PLAN_LABEL[plan] ?? plan}
            </Badge>
          </div>
          <div className="rounded-lg border border-sidebar-border bg-card p-1 flex items-center justify-between shadow-xs">
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
                  organizationSwitcherTrigger:
                    "w-full flex items-center justify-between text-foreground hover:bg-secondary/40 px-2 py-1.5 rounded-lg text-sm transition-all border-none bg-transparent font-medium",
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
        <nav className="flex flex-col gap-1 mt-1">
          <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider px-1 mb-1">
            Navigation
          </span>
          <Link
            href="/dashboard"
            onClick={() => setMobileOpen(false)}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-primary/10 text-primary border border-primary/10"
          >
            <Folder className="h-4 w-4" />
            Projects
          </Link>
        </nav>
      </div>

      <div className="flex flex-col gap-4 pt-4 border-t border-sidebar-border">
        <div className="flex items-center justify-between px-2 text-xs sm:text-sm">
          <span className="text-muted-foreground">AI credits</span>
          <span className="font-semibold text-foreground">{credits.toLocaleString()}</span>
        </div>

        <UpgradeDialog autoOpenLocked={workspaceLocked} />

        {/* User Info / Profile Avatar */}
        <div className="pt-2 flex items-center gap-3">
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
                userButtonOuterIdentifier:
                  "text-muted-foreground font-medium text-xs sm:text-sm text-left truncate max-w-[120px] hover:text-primary transition-colors",
              },
            }}
            showName
          />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Mobile Top Bar (< 1024px) */}
      <header className="lg:hidden flex h-14 items-center justify-between border-b border-border bg-sidebar px-4 shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded-lg text-foreground/80 hover:text-foreground hover:bg-secondary transition-colors"
            aria-label="Open sidebar navigation"
          >
            <PanelLeft className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-1.5">
            <Image src="/logo.svg" alt="SomeScript Logo" width={28} height={28} className="h-7 w-7 -mr-1" />
            <span className="font-semibold text-base tracking-tight text-foreground">
              SomeScript
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={plan === "free" ? "outline" : "default"} className="uppercase text-[9px] px-2 py-0.5">
            {PLAN_LABEL[plan] ?? plan}
          </Badge>
          <UserButton showName={false} />
        </div>
      </header>

      {/* Mobile Drawer Sheet Backdrop & Panel */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 z-50 w-72 bg-sidebar border-r border-border p-5 shadow-2xl animate-in slide-in-from-left duration-250">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-sidebar-border">
              <span className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-wider">Menu</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1 rounded-md text-foreground/70 hover:text-foreground hover:bg-secondary transition-colors"
                aria-label="Close sidebar navigation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {sidebarContent}
          </aside>
        </>
      )}

      {/* Desktop Sidebar (>= 1024px) */}
      <aside className="hidden lg:flex w-64 border-r border-border bg-sidebar flex-col justify-between p-6 shrink-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
