import { expect, test } from "bun:test";
import { parseCompileErrors } from "./compile-errors";

test("parses a single Tectonic error", () => {
  const log = "some info\nerror: main.tex:3: Undefined control sequence\nerror: halted on potentially-recoverable error as specified\n";
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
  const log = "error: !File ended while scanning use of \\textbf\nerror: halted on potentially-recoverable error as specified\n";
  expect(parseCompileErrors(log, "main.tex")).toEqual([]);
});

test("returns an empty list for a clean compile log", () => {
  const log = "[INFO] Starting compile\n[SUCCESS] main.pdf\n";
  expect(parseCompileErrors(log, "main.tex")).toEqual([]);
});
