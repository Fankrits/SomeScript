import { expect, test } from "bun:test";
import { formatCompileForModel, parseCompileErrors } from "./compile-errors";

test("parses a single Tectonic error", () => {
  const log =
    "some info\nerror: main.tex:3: Undefined control sequence\nerror: halted on potentially-recoverable error as specified\n";
  expect(parseCompileErrors(log, "main.tex")).toEqual([
    { file: "main.tex", line: 3, message: "Undefined control sequence" },
  ]);
});

test("parses multiple errors and resolves bare basenames against compilePath", () => {
  const log = [
    "error: main.tex:5: Missing $ inserted",
    "error: main.tex:9: Undefined control sequence",
  ].join("\n");
  expect(parseCompileErrors(log, "chapters/main.tex")).toEqual([
    { file: "chapters/main.tex", line: 5, message: "Missing $ inserted" },
    { file: "chapters/main.tex", line: 9, message: "Undefined control sequence" },
  ]);
});

test("strips ANSI color codes before matching", () => {
  const log = "\u001B[31merror: main.tex:2: Missing $ inserted\u001B[0m";
  expect(parseCompileErrors(log, "main.tex")).toEqual([
    { file: "main.tex", line: 2, message: "Missing $ inserted" },
  ]);
});

test("ignores fatal errors without a file:line, without throwing", () => {
  const log =
    "error: !File ended while scanning use of \\textbf\nerror: halted on potentially-recoverable error as specified\n";
  expect(parseCompileErrors(log, "main.tex")).toEqual([]);
});

test("returns an empty list for a clean compile log", () => {
  const log = "[INFO] Starting compile\n[SUCCESS] main.pdf\n";
  expect(parseCompileErrors(log, "main.tex")).toEqual([]);
});

// The compiler retries with remote package fetching on a cold cache, so a real
// log reports the same mistake once per pass. Verified against actual Tectonic
// output for a planted \thisIsNotACommand.
test("collapses the same error repeated by the two-pass retry", () => {
  const log = [
    "error: main.tex:35: Undefined control sequence",
    "error: something bad happened inside XeTeX; its output follows:",
    "[INFO] Cached compilation failed or package missing. Retrying with remote package fetching...",
    "error: main.tex:35: Undefined control sequence",
    "[ERROR] Tectonic exited with code 1",
  ].join("\n");
  expect(parseCompileErrors(log, "main.tex")).toEqual([
    { file: "main.tex", line: 35, message: "Undefined control sequence" },
  ]);
});

test("keeps distinct errors that share a line", () => {
  const log = [
    "error: main.tex:7: Missing $ inserted",
    "error: main.tex:7: Undefined control sequence",
  ].join("\n");
  expect(parseCompileErrors(log, "main.tex")).toHaveLength(2);
});

test("formatCompileForModel lists errors and truncates a huge log", () => {
  const errors = parseCompileErrors("error: main.tex:3: Missing $ inserted", "main.tex");
  const out = formatCompileForModel(errors, "x".repeat(50_000));
  expect(out).toContain("Errors (1):");
  expect(out).toContain("- main.tex:3: Missing $ inserted");
  expect(out).toContain("…(truncated)");
  expect(out.length).toBeLessThan(6_000);
});

test("formatCompileForModel is empty for a clean, empty outcome", () => {
  expect(formatCompileForModel([], "")).toBe("");
});
