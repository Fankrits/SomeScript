import { expect, test } from "bun:test";
import { pickDetectedMainFile } from "./main-file";

test("returns the unique file containing \\documentclass", () => {
  expect(pickDetectedMainFile(["a.tex", "b.tex"], ["a.tex"])).toBe("a.tex");
});

test("returns null when no file matches", () => {
  expect(pickDetectedMainFile(["a.tex", "b.tex"], [])).toBeNull();
});

test("returns null when multiple files match (ambiguous)", () => {
  expect(pickDetectedMainFile(["a.tex", "b.tex"], ["a.tex", "b.tex"])).toBeNull();
});

test("ignores matches outside the project's .tex files (e.g. stale logs)", () => {
  expect(pickDetectedMainFile(["a.tex"], ["a.tex", "build.log"])).toBe("a.tex");
});
