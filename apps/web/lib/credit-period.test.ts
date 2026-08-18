import { expect, test } from "bun:test";
import { nextPeriodResetAt } from "./credits";

const DAY = 24 * 60 * 60 * 1000;
const PERIOD = 30 * DAY;

test("advances exactly one period when the reset just came due", () => {
  const current = new Date("2026-01-01T00:00:00Z");
  const now = new Date(current.getTime() + 1000);
  expect(nextPeriodResetAt(current, now).getTime()).toBe(current.getTime() + PERIOD);
});

test("a dormant workspace catches up in one jump, not one grant per missed period", () => {
  const current = new Date("2026-01-01T00:00:00Z");
  // Nearly a year of inactivity: the next reset must still be a single instant
  // in the future, not 12 sequential grants.
  const now = new Date(current.getTime() + 11.5 * PERIOD);
  const next = nextPeriodResetAt(current, now);
  expect(next.getTime()).toBeGreaterThan(now.getTime());
  expect(next.getTime()).toBe(current.getTime() + 12 * PERIOD);
});

test("the result is always strictly in the future", () => {
  const current = new Date("2026-01-01T00:00:00Z");
  for (const elapsed of [0, 1, PERIOD, PERIOD * 3.7, PERIOD * 40]) {
    const now = new Date(current.getTime() + elapsed);
    expect(nextPeriodResetAt(current, now).getTime()).toBeGreaterThan(now.getTime());
  }
});

test("resets land on the anniversary, so the renewal date does not drift later", () => {
  // Read late in the period — the next reset still keys off the original date.
  const current = new Date("2026-01-01T00:00:00Z");
  const now = new Date(current.getTime() + PERIOD + 20 * DAY);
  expect(nextPeriodResetAt(current, now).getTime()).toBe(current.getTime() + 2 * PERIOD);
});
