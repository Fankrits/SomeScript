import { expect, test } from "bun:test";
import { maxMembersFor, PLAN_LIMITS, PLAN_PRICING, CREDIT_PACKS, CREDIT_COST_USD } from "./plans";

test("every plan caps members at a flat number — Team is a band, not seats", () => {
  expect(maxMembersFor("free")).toBe(3);
  expect(maxMembersFor("pro")).toBe(3);
  expect(maxMembersFor("team")).toBe(15);
});

test("worst-case COGS stays under the price on every paid plan", () => {
  // The whole point of a cost-linked credit: max AI spend is credits * $0.002.
  for (const plan of ["pro", "team"] as const) {
    const worstCaseCogs = PLAN_LIMITS[plan].monthlyAiCredits * CREDIT_COST_USD;
    const monthly = PLAN_PRICING[plan].monthly.priceUsd;
    expect(worstCaseCogs).toBeLessThan(monthly);
    // and leaves at least a 60% gross margin floor
    expect((monthly - worstCaseCogs) / monthly).toBeGreaterThan(0.6);
  }
});

test("free tier exposure is bounded", () => {
  expect(PLAN_LIMITS.free.monthlyAiCredits * CREDIT_COST_USD).toBeLessThanOrEqual(1);
});

test("annual is a real discount on both paid plans", () => {
  for (const plan of ["pro", "team"] as const) {
    const { monthly, annual } = PLAN_PRICING[plan];
    expect(annual.priceUsd).toBeLessThan(monthly.priceUsd * 12);
    expect(annual.perMonthUsd).toBeLessThan(monthly.perMonthUsd);
  }
});

test("credit packs get cheaper per credit as they get bigger", () => {
  const perCredit = CREDIT_PACKS.map((p) => p.priceUsd / p.credits);
  for (let i = 1; i < perCredit.length; i++) {
    expect(perCredit[i]).toBeLessThan(perCredit[i - 1]);
  }
  // and every pack still sells a credit for more than it costs to serve
  for (const rate of perCredit) expect(rate).toBeGreaterThan(CREDIT_COST_USD);
});
