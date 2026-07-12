import { expect, test } from "bun:test";
import { safeZipPath } from "./zip";

test("normalizes and accepts plain relative paths", () => {
  expect(safeZipPath("sections/intro.tex")).toBe("sections/intro.tex");
  expect(safeZipPath("./figure.png")).toBe("figure.png");
});

test("rejects traversal, absolute, and backslash paths", () => {
  expect(safeZipPath("a/../../b.tex")).toBe(null);
  expect(safeZipPath("../evil.tex")).toBe(null);
  expect(safeZipPath("/etc/passwd")).toBe(null);
  expect(safeZipPath("a\\b.tex")).toBe(null);
});
