import { expect, test } from "bun:test";
import { daysLeft } from "./utils";

const DAY = 86_400_000;
const now = Date.parse("2026-08-18T12:00:00Z");

test("daysLeft counts down over the retention window", () => {
  expect(daysLeft(new Date(now), 7, now)).toBe(7);
  expect(daysLeft(new Date(now - 6 * DAY), 7, now)).toBe(1);
});

test("daysLeft floors at zero once expired", () => {
  expect(daysLeft(new Date(now - 7 * DAY), 7, now)).toBe(0);
  expect(daysLeft(new Date(now - 30 * DAY), 7, now)).toBe(0);
});
