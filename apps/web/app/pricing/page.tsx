import type { Metadata } from "next";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import HeroBackground from "@/components/hero-background";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { CREDIT_PACKS, PLAN_LIMITS, PLAN_PRICING } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Pricing — SomeScript",
  description:
    "Free for three collaborators and ten projects. Pro from $10/month, Team at a flat $29 for up to 15 members. No per-seat charges.",
};

/**
 * Every figure is read from lib/plans.ts — the same constants the app enforces —
 * so the marketing price can never drift from the billed one.
 */
const TIERS = [
  {
    id: "free" as const,
    name: "Free",
    price: "$0",
    cadence: "forever",
    who: "Students, single papers, and the person who invites two co-authors.",
    features: [
      `${PLAN_LIMITS.free.maxMembers} members, 1 workspace`,
      `${PLAN_LIMITS.free.maxProjects} projects`,
      `${PLAN_LIMITS.free.monthlyAiCredits.toLocaleString()} AI credits per month`,
      "Lite AI mode",
      "Unlimited compiles",
      "Real-time collaboration",
    ],
    limits: ["No Pro or Expert AI modes", "Credits do not roll over"],
    cta: "Start free",
  },
  {
    id: "pro" as const,
    name: "Pro",
    price: `$${PLAN_PRICING.pro.annual.perMonthUsd}`,
    cadence: `/month billed yearly · $${PLAN_PRICING.pro.monthly.priceUsd} monthly`,
    who: "The working researcher and their two collaborators.",
    highlight: true,
    features: [
      `${PLAN_LIMITS.pro.maxMembers} members, 1 workspace`,
      "Unlimited projects",
      `${PLAN_LIMITS.pro.monthlyAiCredits.toLocaleString()} AI credits per month`,
      "All three AI modes",
      "Credit top-up packs",
      "Unlimited compiles & collaboration",
    ],
    limits: [],
    cta: "Choose Pro",
  },
  {
    id: "team" as const,
    name: "Team",
    price: `$${PLAN_PRICING.team.monthly.priceUsd}`,
    cadence: `/month flat · $${PLAN_PRICING.team.annual.priceUsd} billed yearly`,
    who: "Labs and groups past three people. No seat counting.",
    features: [
      `Up to ${PLAN_LIMITS.team.maxMembers} members, flat price`,
      "Unlimited projects",
      `${PLAN_LIMITS.team.monthlyAiCredits.toLocaleString()} AI credits per month`,
      "All three AI modes",
      "Invites are free — no per-seat charge",
      "Credit top-up packs",
    ],
    limits: [],
    cta: "Choose Team",
  },
];

export default function PricingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground font-sans selection:bg-primary/20 relative overflow-hidden">
      <HeroBackground />
      <Header />

      <main className="flex-1 flex flex-col relative w-full z-10 py-12 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl md:text-5xl font-medium font-serif tracking-tight text-foreground mb-4">
            Pricing
          </h1>
          <p className="text-muted-foreground text-sm md:text-base font-light max-w-xl mx-auto">
            Every plan bills the workspace, not the person. Invite your co-authors without watching
            a counter.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.id}
              className={`flex flex-col rounded-xl border bg-card/80 backdrop-blur-md p-6 shadow-lg ${
                tier.highlight ? "border-primary" : "border-border"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium font-serif text-foreground">{tier.name}</h2>
                {tier.highlight && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                    Most popular
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight text-foreground">
                  {tier.price}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{tier.cadence}</p>
              <p className="mt-4 text-sm font-light text-foreground/80">{tier.who}</p>

              <ul className="mt-5 flex flex-col gap-2 text-sm text-foreground/80">
                {tier.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                      strokeWidth={2.5}
                      aria-hidden
                    />
                    <span className="font-light">{f}</span>
                  </li>
                ))}
                {tier.limits.map((l) => (
                  <li key={l} className="flex items-start gap-2 text-muted-foreground">
                    <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="font-light">{l}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-6 pt-2 mt-auto">
                <Button
                  asChild
                  variant={tier.highlight ? "default" : "outline"}
                  className="w-full h-10"
                >
                  <Link href="/dashboard">{tier.cta}</Link>
                </Button>
              </div>
            </div>
          ))}
        </div>

        <section className="mt-14">
          <h2 className="text-2xl font-medium font-serif text-foreground text-center">
            Need more AI?
          </h2>
          <p className="mt-2 text-center text-sm font-light text-muted-foreground max-w-xl mx-auto">
            Credits meter what the AI actually costs to run, so a short question costs a fraction of
            a long one. Top up any time — purchased credits never expire.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3 max-w-3xl mx-auto">
            {CREDIT_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="rounded-xl border border-border bg-card/80 backdrop-blur-md p-5 text-center shadow-sm"
              >
                <div className="text-2xl font-semibold tracking-tight text-foreground">
                  {pack.credits.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">credits</div>
                <div className="mt-2 text-sm font-medium text-foreground">${pack.priceUsd}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-14 max-w-3xl mx-auto w-full">
          <h2 className="text-2xl font-medium font-serif text-foreground text-center mb-6">
            Questions
          </h2>
          <dl className="flex flex-col gap-5 text-sm">
            {[
              {
                q: "Do collaborators need their own subscription?",
                a: "No. The subscription belongs to the workspace, so everyone you invite gets the workspace's plan. Team is a flat price up to 15 members — inviting someone never changes your bill.",
              },
              {
                q: "How many workspaces do I get?",
                a: "One free workspace per account. Additional workspaces each carry their own Pro or Team subscription, which keeps separate projects — and separate grants — on separate bills.",
              },
              {
                q: "What is an AI credit?",
                a: "A unit of AI usage. Credits are metered against what a request genuinely costs to run, so cheaper Lite requests draw far fewer credits than long Expert ones.",
              },
              {
                q: "What happens when I run out of credits?",
                a: "Everything except the AI assistant keeps working — editing, compiling and collaboration are never metered. Your allowance refills each month, or you can top up.",
              },
              {
                q: "Can I cancel?",
                a: "Any time, from the billing portal. Your workspace stays on its current plan until the end of the period, then drops to Free. Your projects are never deleted.",
              },
            ].map(({ q, a }) => (
              <div key={q} className="border-b border-border pb-4 last:border-b-0">
                <dt className="font-medium text-foreground">{q}</dt>
                <dd className="mt-1.5 font-light text-muted-foreground leading-relaxed">{a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <Footer />
    </div>
  );
}
