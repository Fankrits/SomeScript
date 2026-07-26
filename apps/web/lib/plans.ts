import type { subscriptionPlanEnum } from "@/db/schema";

export type Plan = (typeof subscriptionPlanEnum.enumValues)[number];

// monthlyAiCredits are placeholders — tune against real Eve/Claude API cost per
// request once that's measured. Everything else here is a hard product decision.
export const PLAN_LIMITS: Record<
  Plan,
  { maxProjects: number; maxMembers: number; maxOwnedWorkspaces: number; monthlyAiCredits: number }
> = {
  free: { maxProjects: 3, maxMembers: 3, maxOwnedWorkspaces: 1, monthlyAiCredits: 200 },
  pro: { maxProjects: Infinity, maxMembers: 3, maxOwnedWorkspaces: 1, monthlyAiCredits: 2000 },
  team: { maxProjects: Infinity, maxMembers: Infinity, maxOwnedWorkspaces: 1, monthlyAiCredits: 5000 }, // members capped by `seats` on the subscription row, not here
};

// Below Pro's flat per-workspace price for 3 members, so Team only makes sense at 3+ seats.
export const TEAM_MIN_SEATS = 3;

/** Clerk's `maxAllowedMemberships`/`createOrganizationsLimit`: 0 means unlimited. */
function toClerkLimit(max: number): number {
  return max === Infinity ? 0 : max;
}

/** Team's member cap is whatever the workspace pays for in seats, not a fixed PLAN_LIMITS number. */
export function maxMembersFor(plan: Plan, seats: number | null): number {
  if (plan === "team") return seats ?? TEAM_MIN_SEATS;
  return toClerkLimit(PLAN_LIMITS[plan].maxMembers);
}

// One-time top-up purchases, applied to credit_balances.purchasedBalance. Not a
// subscription — Stripe one-time payment products once billing is wired up.
export const CREDIT_PACKS = [
  { id: "pack_500", credits: 500, priceUsd: 5 },
  { id: "pack_2000", credits: 2000, priceUsd: 15 },
  { id: "pack_5000", credits: 5000, priceUsd: 30 },
] as const;

// Mirrors apps/editor/lib/eve-modes.ts's EveMode. Not imported directly — the two
// Next apps share no package, so this is the one deliberate duplication of that
// 3-string union; keep both in sync by hand if a mode is ever added or renamed.
export type EveMode = "lite" | "pro" | "expert";

// Credits per 1,000 output tokens, ~70% margin over real per-mode cost ($3/$8/$16 per 1M).
export const EVE_MODE_CREDIT_COST: Record<EveMode, number> = {
  lite: 1,
  pro: 3,
  expert: 5,
};

export const MODE_ACCESS_BY_PLAN: Record<Plan, readonly EveMode[]> = {
  free: ["lite"],
  pro: ["lite", "pro", "expert"],
  team: ["lite", "pro", "expert"],
};
