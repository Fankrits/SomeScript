import { describe, expect, test } from "bun:test";
import { compare, flatten } from "./audit-gate.mjs";

const adv = (ghsa: string, severity: string, title = "t") => ({
  id: 1,
  url: `https://github.com/advisories/${ghsa}`,
  severity,
  title,
});

describe("flatten", () => {
  test("keys advisories by GHSA id and keeps the package", () => {
    const out = flatten({
      lodash: [adv("GHSA-aaaa", "high", "Prototype pollution")],
      semver: [adv("GHSA-bbbb", "low")],
    });
    expect(out).toEqual({
      "lodash#GHSA-aaaa": {
        advisory: "GHSA-aaaa",
        package: "lodash",
        severity: "high",
        title: "Prototype pollution",
      },
      "semver#GHSA-bbbb": { advisory: "GHSA-bbbb", package: "semver", severity: "low", title: "t" },
    });
  });

  test("the same advisory on two packages stays two entries", () => {
    const out = flatten({ a: [adv("GHSA-same", "high")], b: [adv("GHSA-same", "high")] });
    expect(Object.keys(out)).toEqual(["a#GHSA-same", "b#GHSA-same"]);
  });
});

describe("compare", () => {
  const entry = (severity: string) => ({ advisory: "GHSA-x", package: "a", severity, title: "t" });
  const known = { "a#GHSA-old": { ...entry("critical"), advisory: "GHSA-old" } };

  test("known advisories never fail the gate, however severe", () => {
    expect(compare(known, known).failing).toEqual([]);
  });

  test("a new advisory at or above the threshold fails", () => {
    const current = { ...known, "b#GHSA-new": entry("high") };
    expect(compare(current, known).failing.map(([id]) => id)).toEqual(["b#GHSA-new"]);
  });

  test("a new advisory below the threshold is reported but does not fail", () => {
    const current = { ...known, "b#GHSA-new": entry("moderate") };
    const r = compare(current, known);
    expect(r.added).toHaveLength(1);
    expect(r.failing).toEqual([]);
    expect(compare(current, known, "moderate").failing).toHaveLength(1);
  });

  test("fixed advisories are listed as resolved", () => {
    expect(compare({}, known).resolved.map(([id]) => id)).toEqual(["a#GHSA-old"]);
  });

  test("a known advisory reaching a NEW package is new", () => {
    const current = {
      ...known,
      "b#GHSA-old": { ...entry("high"), advisory: "GHSA-old", package: "b" },
    };
    expect(compare(current, known).failing.map(([id]) => id)).toEqual(["b#GHSA-old"]);
  });

  test("rejects an unknown severity threshold", () => {
    expect(() => compare({}, {}, "urgent")).toThrow("--fail-on");
  });
});
