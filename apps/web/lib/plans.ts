import type { subscriptionPlanEnum } from "@/db/schema";

export type Plan = (typeof subscriptionPlanEnum.enumValues)[number];

// Members and projects are packaging, not cost: a member is ~$0.02 of Clerk MRU
// plus ~$0.05 of infra, and Clerk bills per *organization* ($1/MRO) regardless of
// its size. AI tokens are the only real variable cost, and monthlyAiCredits meters
// them exactly — see CREDIT_COST_USD. That asymmetry is why Team is a flat band
// rather than per-seat: charging per head would bill twice for the same tokens.
export const PLAN_LIMITS: Record<
  Plan,
  { maxProjects: number; maxMembers: number; monthlyAiCredits: number }
> = {
  free: { maxProjects: 10, maxMembers: 3, monthlyAiCredits: 300 },
  pro: { maxProjects: Infinity, maxMembers: 3, monthlyAiCredits: 2000 },
  team: { maxProjects: Infinity, maxMembers: 15, monthlyAiCredits: 5000 },
};

/**
 * The personal (non-org) workspace is auto-created for every user and is not a
 * Clerk organization, so it has no membership mechanism at all — syncWorkspaceMemberLimit
 * skips it. Granting it the full free allowance handed each user two free credit
 * pools (personal + first org). It stays usable as a solo scratchpad on a reduced
 * grant; the collaborative free tier is the organization.
 */
export const PERSONAL_WORKSPACE_CREDITS = 100;

/** Clerk's `maxAllowedMemberships`/`createOrganizationsLimit`: 0 means unlimited. */
function toClerkLimit(max: number): number {
  return max === Infinity ? 0 : max;
}

/** Every plan's member cap is a flat number now — Team is a band, not a seat count. */
export function maxMembersFor(plan: Plan): number {
  return toClerkLimit(PLAN_LIMITS[plan].maxMembers);
}

export type BillingCadence = "monthly" | "annual";

/**
 * Annual is ~17% off and replaces the student discount outright: it needs no
 * verification subsystem, and students are the most annual-friendly buyers there
 * are — their need is bounded by a degree, not a month.
 */
export const PLAN_PRICING: Record<
  "pro" | "team",
  Record<BillingCadence, { priceUsd: number; perMonthUsd: number }>
> = {
  pro: {
    monthly: { priceUsd: 12, perMonthUsd: 12 },
    annual: { priceUsd: 120, perMonthUsd: 10 },
  },
  team: {
    monthly: { priceUsd: 29, perMonthUsd: 29 },
    annual: { priceUsd: 290, perMonthUsd: 24 },
  },
};

// One-time top-up purchases, applied to credit_balances.purchasedBalance. No $5
// pack: Stripe's 2.9% + $0.30 is 9% of a $5 charge, so the smallest rung was the
// worst-margin one. The ladder discounts from $0.0075 to $0.005 per credit.
export const CREDIT_PACKS = [
  { id: "pack_2000", credits: 2000, priceUsd: 15 },
  { id: "pack_5000", credits: 5000, priceUsd: 30 },
  { id: "pack_12000", credits: 12000, priceUsd: 60 },
] as const;

// Mirrors apps/editor/lib/eve-modes.ts's EveMode. Not imported directly — the two
// Next apps share no package, so this is the one deliberate duplication of that
// 3-string union; keep both in sync by hand if a mode is ever added or renamed.
export type EveMode = "lite" | "pro" | "expert";

/**
 * One credit is $0.002 of real model spend. Credits sell for $0.005–$0.0075 on the
 * pack ladder, so this fixes gross margin at ~66% in the worst case (a plan's whole
 * allowance drained) and 85–90% blended.
 *
 * This replaced a per-mode credits-per-1k-output-tokens table whose rates encoded
 * model prices 7–20x out of date and ignored input tokens entirely — where most of
 * the spend actually is. Billing from the cost the gateway reports means there is
 * no table to go stale the next time a model is swapped.
 */
export const CREDIT_COST_USD = 0.002;

/**
 * Used only when a model call reports no cost, which should not happen — the AI
 * Gateway returns it on every generation. Set at the most expensive mode's output
 * rate so the fallback can never undercharge; computeCreditCost logs when it fires.
 */
export const FALLBACK_CREDITS_PER_1K_OUTPUT = 8;

export const MODE_ACCESS_BY_PLAN: Record<Plan, readonly EveMode[]> = {
  free: ["lite"],
  pro: ["lite", "pro", "expert"],
  team: ["lite", "pro", "expert"],
};
