import { expect, test } from "bun:test";
import { buildSearchPattern, replaceMatchAt } from "./search-pattern";
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

test("replaces only the occurrence at the reported match index", () => {
  const re = buildSearchPattern("cat", opts);
  expect(replaceMatchAt("cat cat cat", re, 4, "dog")).toBe("cat dog cat");
});

test("returns null when the reported match index is stale", () => {
  const re = buildSearchPattern("cat", opts);
  expect(replaceMatchAt("cat cat", re, 3, "dog")).toBeNull();
});

test("returns null when the reported line snapshot is stale", () => {
  const re = buildSearchPattern("cat", opts);
  expect(replaceMatchAt("dog cat cat", re, 4, "bird", "cat cat")).toBeNull();
});
