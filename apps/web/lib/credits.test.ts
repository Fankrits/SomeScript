import { expect, test } from "bun:test";
import { computeCreditCost, drainCredits } from "./credits";

test("cost scales by mode rate and rounds up partial thousands", () => {
  expect(computeCreditCost("lite", 1000)).toBe(1);
  expect(computeCreditCost("pro", 1000)).toBe(3);
  expect(computeCreditCost("expert", 1000)).toBe(5);
  expect(computeCreditCost("lite", 1)).toBe(1); // rounds up, never undercharges
  expect(computeCreditCost("lite", 2500)).toBe(3);
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
