import { expect, test } from "bun:test";
import { maxMembersFor } from "./plans";

test("free and pro cap at PLAN_LIMITS.maxMembers", () => {
  expect(maxMembersFor("free", null)).toBe(3);
  expect(maxMembersFor("pro", null)).toBe(3);
});

test("team's cap is seats, not a fixed number", () => {
  expect(maxMembersFor("team", 7)).toBe(7);
});

test("team falls back to the 3-seat minimum when seats is unset", () => {
  expect(maxMembersFor("team", null)).toBe(3);
});
