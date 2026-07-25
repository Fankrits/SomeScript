import { EVE_MODE_CREDIT_COST, type EveMode } from "@/lib/plans";

/** Credits owed for a turn's output tokens. Rounds up: never undercharge a partial 1,000-token turn. */
export function computeCreditCost(mode: EveMode, outputTokens: number): number {
  return Math.ceil((outputTokens / 1000) * EVE_MODE_CREDIT_COST[mode]);
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
