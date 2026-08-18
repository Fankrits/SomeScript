import { expect, test } from "bun:test";
import { computeCreditCost, drainCredits } from "./credits";
import { CREDIT_COST_USD, FALLBACK_CREDITS_PER_1K_OUTPUT } from "./plans";

test("bills reported cost at $0.002 per credit", () => {
  expect(computeCreditCost({ costUsd: 0.002, outputTokens: 800 })).toBe(1);
  expect(computeCreditCost({ costUsd: 0.02, outputTokens: 800 })).toBe(10);
  // The context-stuffing case the old output-only formula charged 1 credit for.
  expect(computeCreditCost({ costUsd: 0.3975, outputTokens: 900 })).toBe(199);
});

test("rounds up, so a sub-credit call is never free", () => {
  expect(computeCreditCost({ costUsd: CREDIT_COST_USD / 100, outputTokens: 10 })).toBe(1);
});

test("cost, not output tokens, drives price", () => {
  // Same output, 10x the cost (a bigger model or a stuffed context) -> 10x the credits.
  const cheap = computeCreditCost({ costUsd: 0.004, outputTokens: 800 });
  const dear = computeCreditCost({ costUsd: 0.04, outputTokens: 800 });
  expect(dear).toBe(cheap * 10);
});

test("falls back to output tokens when no cost is reported", () => {
  expect(computeCreditCost({ outputTokens: 1000 })).toBe(FALLBACK_CREDITS_PER_1K_OUTPUT);
  expect(computeCreditCost({ outputTokens: 2500 })).toBe(
    Math.ceil(2.5 * FALLBACK_CREDITS_PER_1K_OUTPUT),
  );
});

test("ignores a nonsensical cost and falls back rather than billing zero", () => {
  expect(computeCreditCost({ costUsd: 0, outputTokens: 1000 })).toBe(
    FALLBACK_CREDITS_PER_1K_OUTPUT,
  );
  expect(computeCreditCost({ costUsd: Number.NaN, outputTokens: 1000 })).toBe(
    FALLBACK_CREDITS_PER_1K_OUTPUT,
  );
});

test("the plan allowance is a real cost ceiling", () => {
  // Whatever the usage pattern, N credits can never cost more than N * $0.002.
  const credits = computeCreditCost({ costUsd: 4.0, outputTokens: 5000 });
  expect(credits * CREDIT_COST_USD).toBeGreaterThanOrEqual(4.0);
});

test("drains included balance before touching purchased", () => {
  const result = drainCredits(10, 5, 4);
  expect(result).toEqual({ newIncluded: 6, newPurchased: 5 });
});

test("spills into purchased once included is exhausted", () => {
  const result = drainCredits(3, 10, 8);
  expect(result).toEqual({ newIncluded: 0, newPurchased: 5 });
});

test("purchased can go negative — an overage signal, not a bug", () => {
  const result = drainCredits(0, 2, 10);
  expect(result).toEqual({ newIncluded: 0, newPurchased: -8 });
});

test("included never goes negative", () => {
  const result = drainCredits(2, 0, 5);
  expect(result.newIncluded).toBe(0);
  expect(result.newPurchased).toBe(-3);
});
