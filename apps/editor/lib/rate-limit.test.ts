import { expect, test } from "bun:test";
import { rateLimit } from "./rate-limit";

test("allows up to the limit then blocks", () => {
  for (let i = 0; i < 5; i++) expect(rateLimit("t1", 5, 60_000)).toBe(true);
  expect(rateLimit("t1", 5, 60_000)).toBe(false);
});

test("keys are independent", () => {
  expect(rateLimit("t2-a", 1, 60_000)).toBe(true);
  expect(rateLimit("t2-b", 1, 60_000)).toBe(true);
  expect(rateLimit("t2-a", 1, 60_000)).toBe(false);
});

test("refills over time", () => {
  expect(rateLimit("t3", 1, 100)).toBe(true);
  expect(rateLimit("t3", 1, 100)).toBe(false);
  Bun.sleepSync(150);
  expect(rateLimit("t3", 1, 100)).toBe(true);
});
