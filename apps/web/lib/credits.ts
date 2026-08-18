import { CREDIT_COST_USD, FALLBACK_CREDITS_PER_1K_OUTPUT } from "@/lib/plans";

/** One model call's reported usage, as eve surfaces it on `step.completed`. */
export type StepUsage = {
  /** What the AI Gateway actually charged for this call. The authoritative input. */
  costUsd?: number;
  outputTokens?: number;
};

/**
 * Credits owed for one model call. Rounds up: never undercharge a partial credit.
 *
 * Billing from reported cost rather than a per-mode token rate means input, cached
 * and output tokens are all covered automatically at whatever the model really
 * charges — so the mode no longer affects price at all, only entitlement.
 */
export function computeCreditCost(usage: StepUsage): number {
  const { costUsd, outputTokens = 0 } = usage;

  if (typeof costUsd === "number" && Number.isFinite(costUsd) && costUsd > 0) {
    return Math.ceil(costUsd / CREDIT_COST_USD);
  }

  // Should be unreachable — the gateway reports cost on every generation. Loud on
  // purpose: silently falling back means margin is being estimated, not measured.
  console.error("[credits] model call reported no costUsd; billing at fallback rate", usage);
  return Math.ceil((outputTokens / 1000) * FALLBACK_CREDITS_PER_1K_OUTPUT);
}

const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The next allowance-reset instant strictly after `now`, advancing in whole
 * periods from `current`.
 *
 * Whole periods rather than `now + 30d` so a workspace's renewal date doesn't
 * drift later every time it happens to be read late; jumping straight past all
 * elapsed periods keeps a workspace dormant for a year from being granted twelve
 * times over when it finally comes back.
 */
export function nextPeriodResetAt(current: Date, now: Date): Date {
  const elapsed = now.getTime() - current.getTime();
  const periods = Math.max(1, Math.floor(elapsed / PERIOD_MS) + 1);
  return new Date(current.getTime() + periods * PERIOD_MS);
}

/**
 * Drains `cost` from included balance first, then purchased. Purchased can go
 * negative — that's a real overage signal a future pre-flight check reacts to,
 * not a bug, since this always records cost for a turn that already ran.
 */
export function drainCredits(
  currentIncluded: number,
  currentPurchased: number,
  cost: number,
): { newIncluded: number; newPurchased: number } {
  const newIncluded = Math.max(0, currentIncluded - cost);
  const fromPurchased = cost - (currentIncluded - newIncluded);
  return { newIncluded, newPurchased: currentPurchased - fromPurchased };
}
