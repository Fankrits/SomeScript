"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createCheckoutSession } from "@/app/dashboard/billing-actions";
import { PLAN_LIMITS, TEAM_MIN_SEATS } from "@/lib/plans";
import { ArrowRight, ArrowUpCircle, Check, Loader2, Sparkles, UsersRound } from "lucide-react";

const PLANS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    cadence: "forever",
    eyebrow: "For getting started",
    detail: "A focused workspace for your first documents.",
    bullets: [
      `${PLAN_LIMITS.free.maxMembers} members`,
      `${PLAN_LIMITS.free.maxProjects} projects`,
      `${PLAN_LIMITS.free.monthlyAiCredits.toLocaleString()} AI credits/mo`,
      "Lite Eve mode",
    ],
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: "$12",
    cadence: "/mo",
    highlight: true,
    eyebrow: "Most popular",
    detail: "More room to write, build, and iterate with Eve.",
    bullets: [
      `${PLAN_LIMITS.pro.maxMembers} members`,
      "Unlimited projects",
      `${PLAN_LIMITS.pro.monthlyAiCredits.toLocaleString()} AI credits/mo`,
      "Lite + Pro Eve modes",
    ],
  },
  {
    id: "team" as const,
    name: "Team",
    price: "$18",
    cadence: `/seat/mo, ${TEAM_MIN_SEATS}-seat min`,
    eyebrow: "For shared work",
    detail: "A shared writing studio for teams that move together.",
    bullets: [
      "Per-seat members",
      "Unlimited projects",
      `${PLAN_LIMITS.team.monthlyAiCredits.toLocaleString()} AI credits/mo`,
      "Lite + Pro + Expert Eve modes",
    ],
  },
];

type PaidPlanId = "pro" | "team";

export function UpgradeDialog() {
  const [open, setOpen] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<PaidPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUpgrade = async (plan: PaidPlanId) => {
    setError(null);
    setLoadingPlan(plan);
    try {
      const { url } = await createCheckoutSession(plan);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout");
      setLoadingPlan(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-border bg-card text-foreground hover:bg-secondary rounded-lg"
        >
          <ArrowUpCircle className="h-4 w-4" />
          Upgrade plan
        </Button>
      </DialogTrigger>
      <DialogContent className="overflow-hidden gap-0 border-[#d8e2e3] bg-[#fcfdfc] p-0 text-foreground shadow-[0_24px_80px_-28px_rgba(18,49,58,0.45)] sm:max-w-[920px]">
        <div className="relative overflow-hidden border-b border-[#d8e2e3] bg-[#edf5f4] px-6 pb-6 pt-7 sm:px-8 sm:pb-7 sm:pt-8">
          <div
            aria-hidden="true"
            className="absolute inset-0 opacity-[0.38] [background-image:linear-gradient(rgba(15,76,92,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(15,76,92,0.08)_1px,transparent_1px)] [background-size:22px_22px]"
          />
          <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-[#77b8bd]/20 blur-3xl" />
          <DialogHeader className="relative max-w-xl gap-3">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#0f4c5c]">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#0f4c5c] text-[#f8f5ef] shadow-sm">
                <Sparkles className="h-3.5 w-3.5" />
              </span>
              Workspace plans
            </div>
            <DialogTitle className="font-serif text-3xl font-medium tracking-[-0.035em] text-[#173843] sm:text-[2.15rem]">
              Choose the pace for your next chapter.
            </DialogTitle>
            <DialogDescription className="max-w-md text-sm leading-6 text-[#55727a]">
              Every plan includes the writing tools you need. Scale up when your projects or collaborators do.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-1 gap-3 bg-white p-4 sm:grid-cols-3 sm:gap-4 sm:p-5">
          {PLANS.map((p) => (
            <section
              key={p.id}
              className={`group relative flex min-h-[356px] flex-col overflow-hidden rounded-xl border p-5 transition-all duration-300 ${
                p.highlight
                  ? "border-[#0f4c5c] bg-[#0f4c5c] text-white shadow-[0_16px_34px_-18px_rgba(15,76,92,0.8)] sm:-translate-y-2"
                  : p.id === "team"
                    ? "border-[#eadcc9] bg-[#fffdf9] text-[#1c2e36] hover:-translate-y-1 hover:shadow-[0_14px_26px_-22px_rgba(83,57,31,0.55)]"
                    : "border-[#dfe8e7] bg-[#fbfcfb] text-[#1c2e36] hover:-translate-y-1 hover:shadow-[0_14px_26px_-22px_rgba(15,76,92,0.45)]"
              }`}
            >
              {p.highlight && (
                <>
                  <div aria-hidden="true" className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-[#80c5c7]/25 blur-2xl" />
                  <div aria-hidden="true" className="absolute inset-0 opacity-20 [background-image:radial-gradient(#a7d5d2_0.75px,transparent_0.75px)] [background-size:11px_11px]" />
                </>
              )}
              <div className="relative">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                      p.highlight
                        ? "bg-white/15 text-[#d8f1ee]"
                        : p.id === "team"
                          ? "bg-[#f5eadb] text-[#a55c22]"
                          : "bg-[#eaf1f0] text-[#4c6d72]"
                    }`}
                  >
                    {p.eyebrow}
                  </span>
                  {p.id === "team" && <UsersRound className="h-4 w-4 text-[#bd7b39]" aria-hidden="true" />}
                  {p.highlight && <Sparkles className="h-4 w-4 text-[#b6e3de]" aria-hidden="true" />}
                </div>
                <h3 className="text-lg font-semibold tracking-tight">{p.name}</h3>
                <p className={`mt-1 min-h-10 text-sm leading-5 ${p.highlight ? "text-[#c5dddc]" : "text-[#688087]"}`}>{p.detail}</p>
                <div className="mt-5 flex items-end gap-1">
                  <span className="text-4xl font-semibold tracking-[-0.06em]">{p.price}</span>
                  <span className={`mb-1.5 text-xs font-medium ${p.highlight ? "text-[#b9d7d5]" : "text-[#6c8388]"}`}>{p.cadence}</span>
                </div>
              </div>

              <div className={`relative my-5 h-px ${p.highlight ? "bg-white/15" : "bg-[#dfe8e7]"}`} />
              <ul className={`relative flex flex-1 flex-col gap-2.5 text-sm ${p.highlight ? "text-[#e3f2f0]" : "text-[#46636a]"}`}>
                {p.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-2">
                    <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${p.highlight ? "text-[#9ddbd5]" : "text-[#24717b]"}`} strokeWidth={2.5} />
                    <span>{b}</span>
                  </li>
                ))}
              </ul>

              <div className="relative mt-6">
                {p.id === "free" ? (
                  <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-[#cbd9d7] bg-white/60 text-sm font-medium text-[#6b8388]">
                    Your current foundation
                  </div>
                ) : (
                  <Button
                    onClick={() => handleUpgrade(p.id)}
                    disabled={loadingPlan !== null}
                    variant={p.highlight ? "secondary" : "outline"}
                    className={
                      p.highlight
                        ? "h-10 w-full rounded-lg bg-white font-semibold text-[#0f4c5c] shadow-sm hover:bg-[#e6f4f2]"
                        : "h-10 w-full rounded-lg border-[#c8d8d6] bg-white font-semibold text-[#1c4650] shadow-sm hover:border-[#8aafb0] hover:bg-[#f2f8f7]"
                    }
                  >
                    {loadingPlan === p.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        Choose {p.name}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </>
                    )}
                  </Button>
                )}
              </div>
            </section>
          ))}
        </div>
        <div className="flex flex-col gap-1 border-t border-[#e4eceb] bg-[#f9fbfa] px-6 py-3 text-center text-xs text-[#6c8388] sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span>Upgrade anytime. Your workspace stays yours.</span>
          <span className="font-medium text-[#42656b]">Secure checkout by Stripe</span>
        </div>
        {error && <p className="bg-[#fff3f1] px-6 py-3 text-sm text-destructive sm:px-8">{error}</p>}
      </DialogContent>
    </Dialog>
  );
}
