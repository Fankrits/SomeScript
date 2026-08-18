"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CheckoutForm } from "@/components/checkout-form";
import { createSubscriptionCheckout, createTopUpCheckout } from "@/app/dashboard/billing-actions";
import { CREDIT_PACKS, PLAN_LIMITS, PLAN_PRICING, type BillingCadence } from "@/lib/plans";
import { ArrowLeft, ArrowUpCircle, Check, Coins, Loader2 } from "lucide-react";

/** Every figure comes from lib/plans.ts so the sheet can't drift from what's enforced. */
const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    bullets: [
      `${PLAN_LIMITS.free.maxMembers} members, 1 workspace`,
      `${PLAN_LIMITS.free.maxProjects} projects`,
      `${PLAN_LIMITS.free.monthlyAiCredits.toLocaleString()} AI credits/mo`,
      "Lite AI mode",
      "Unlimited compiles & collaboration",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro",
    highlight: true,
    bullets: [
      `${PLAN_LIMITS.pro.maxMembers} members, 1 workspace`,
      "Unlimited projects",
      `${PLAN_LIMITS.pro.monthlyAiCredits.toLocaleString()} AI credits/mo`,
      "All AI modes",
      "Credit top-up packs",
    ],
  },
  {
    id: "team" as const,
    name: "Team",
    bullets: [
      `Up to ${PLAN_LIMITS.team.maxMembers} members, flat price`,
      "Unlimited projects",
      `${PLAN_LIMITS.team.monthlyAiCredits.toLocaleString()} AI credits/mo`,
      "All AI modes",
      "Invites are free — no per-seat charge",
    ],
  },
];

type PaidPlanId = "pro" | "team";
type CreditPackId = (typeof CREDIT_PACKS)[number]["id"];
type CheckoutState = { clientSecret: string; label: string };

export function UpgradeDialog({
  autoOpenLocked = false,
  currentPlan = "free",
}: {
  autoOpenLocked?: boolean;
  /** The workspace's active plan, so the sheet marks the right card instead of always Free. */
  currentPlan?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpenLocked);
  const [cadence, setCadence] = useState<BillingCadence>("monthly");
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [loadingPack, setLoadingPack] = useState<CreditPackId | null>(null);
  const [checkout, setCheckout] = useState<CheckoutState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setCheckout(null);
    setError(null);
    setLoadingPlan(null);
    setLoadingPack(null);
  };

  const handleUpgrade = async (plan: PaidPlanId, label: string) => {
    setError(null);
    setLoadingPlan(plan);
    try {
      const { clientSecret } = await createSubscriptionCheckout(plan, cadence);
      setCheckout({ clientSecret, label });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setLoadingPlan(null);
    }
  };

  const handleTopUp = async (packId: CreditPackId, label: string) => {
    setError(null);
    setLoadingPack(packId);
    try {
      const { clientSecret } = await createTopUpCheckout(packId);
      setCheckout({ clientSecret, label });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
    } finally {
      setLoadingPack(null);
    }
  };

  const handleSuccess = () => {
    setOpen(false);
    reset();
    // Webhook-driven plan/credit updates land async — refresh so the sidebar picks
    // them up once they do, rather than the dashboard showing stale pre-payment state.
    router.refresh();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-border bg-card text-foreground rounded-lg"
        >
          <ArrowUpCircle className="h-4 w-4" />
          Upgrade plan
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-6">
          {checkout ? (
            <>
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back
              </button>
              <SheetTitle className="text-xl">{checkout.label}</SheetTitle>
              <SheetDescription>Enter payment details to confirm.</SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="text-xl">Workspace plans</SheetTitle>
              <SheetDescription>
                Pick the plan that fits this workspace. Upgrade anytime.
              </SheetDescription>
            </>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {checkout ? (
            <CheckoutForm clientSecret={checkout.clientSecret} onSuccess={handleSuccess} />
          ) : (
            <>
              {autoOpenLocked && (
                <p className="mb-4 rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
                  Your first workspace is free — additional organizations need a paid plan to
                  unlock.
                </p>
              )}

              <div className="mb-4 flex items-center gap-1 rounded-lg bg-secondary/60 p-1">
                {(["monthly", "annual"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => setCadence(c)}
                    className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-all ${
                      cadence === c
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {c}
                    {c === "annual" && <span className="ml-1 text-primary">−17%</span>}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-3">
                {PLANS.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-xl border p-4 ${
                      p.id === currentPlan
                        ? "border-primary bg-primary/[0.03]"
                        : p.highlight
                          ? "border-primary"
                          : "border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-foreground">{p.name}</span>
                      {p.id === currentPlan ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                          Current
                        </span>
                      ) : (
                        p.highlight && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                            Most popular
                          </span>
                        )
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-2xl font-semibold tracking-tight text-foreground">
                        {p.id === "free" ? "$0" : `$${PLAN_PRICING[p.id][cadence].perMonthUsd}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.id === "free"
                          ? "forever"
                          : cadence === "annual"
                            ? `/mo · $${PLAN_PRICING[p.id].annual.priceUsd} billed yearly`
                            : "/mo"}
                      </span>
                    </div>
                    <ul className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
                      {p.bullets.map((b) => (
                        <li key={b} className="flex items-center gap-2">
                          <Check className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={2.5} />
                          {b}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {p.id === currentPlan ? (
                        <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground">
                          Current plan
                        </div>
                      ) : p.id === "free" ? (
                        <div className="flex h-9 items-center justify-center rounded-lg border border-dashed border-border text-xs font-medium text-muted-foreground">
                          Downgrade from Billing
                        </div>
                      ) : (
                        <Button
                          onClick={() => handleUpgrade(p.id, `${p.name} plan`)}
                          disabled={loadingPlan !== null}
                          variant={p.highlight ? "default" : "outline"}
                          className="h-9 w-full"
                        >
                          {loadingPlan === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            `Choose ${p.name}`
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-border pt-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Coins className="h-4 w-4" />
                  Need more AI credits?
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {CREDIT_PACKS.map((pack) => (
                    <Button
                      key={pack.id}
                      variant="outline"
                      disabled={loadingPack !== null}
                      onClick={() =>
                        handleTopUp(pack.id, `${pack.credits.toLocaleString()} AI credits`)
                      }
                      className="h-9 justify-between font-medium"
                    >
                      <span>{pack.credits.toLocaleString()} credits</span>
                      {loadingPack === pack.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <span className="text-muted-foreground">${pack.priceUsd}</span>
                      )}
                    </Button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>

        <div className="border-t border-border px-6 py-3 text-center text-xs text-muted-foreground">
          Secure checkout by Stripe
        </div>
      </SheetContent>
    </Sheet>
  );
}
