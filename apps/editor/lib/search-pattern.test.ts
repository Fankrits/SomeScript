import { expect, test } from "bun:test";
import { buildSearchPattern } from "./search-pattern";
import { ApiError } from "./authz";

const opts = { matchCase: false, matchWholeWord: false, useRegex: false };

test("literal queries are escaped", () => {
  const re = buildSearchPattern("a.b(c)", opts);
  expect(re.test("a.b(c)")).toBe(true);
  expect(re.test("axb(c)")).toBe(false);
});

test("whole-word wraps with boundaries", () => {
  const re = buildSearchPattern("cat", { ...opts, matchWholeWord: true });
  expect(re.test("the cat sat")).toBe(true);
  expect(re.test("concatenate")).toBe(false);
});

test("rejects catastrophic-backtracking regex", () => {
  expect(() => buildSearchPattern("(a+)+$", { ...opts, useRegex: true })).toThrow(ApiError);
});

test("rejects over-long queries", () => {
  expect(() => buildSearchPattern("a".repeat(600), opts)).toThrow(ApiError);
});

test("rejects invalid regex with a 400, not a crash", () => {
  expect(() => buildSearchPattern("([", { ...opts, useRegex: true })).toThrow(ApiError);
});
