import { expect, test } from "bun:test";
import { LocalStorageProvider, isBinaryContent } from "./storage";

const p = new LocalStorageProvider();

test("rejects sibling-directory prefix traversal", async () => {
  // baseDir is <cwd>/projects/abc; "../abc-evil/x" resolves to <cwd>/projects/abc-evil/x,
  // which passes a naive startsWith(baseDir) check but must be rejected.
  await expect(p.readFile("abc", "../abc-evil/secret.txt")).rejects.toThrow("Directory traversal");
});

test("rejects parent traversal", async () => {
  await expect(p.readFile("abc", "../../etc/passwd")).rejects.toThrow("Directory traversal");
});

test("normal relative paths are not flagged as traversal", async () => {
  // File won't exist — ENOENT is fine; it just must not be a traversal error.
  try {
    await p.readFile("zz-does-not-exist", "sections/intro.tex");
  } catch (e) {
    expect(e instanceof Error ? e.message : String(e)).not.toContain("Directory traversal");
  }
});

test("isBinaryContent flags a NUL byte", () => {
  expect(isBinaryContent(Buffer.from([0x48, 0x69, 0x00, 0x21]))).toBe(true);
});

test("isBinaryContent treats plain text and empty buffers as text", () => {
  expect(isBinaryContent(Buffer.from("Hello, world! éè", "utf-8"))).toBe(false);
  expect(isBinaryContent(Buffer.alloc(0))).toBe(false);
});
