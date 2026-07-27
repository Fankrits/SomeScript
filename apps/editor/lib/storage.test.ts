import { expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
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

test("copy rejects traversal in the source path", async () => {
  await expect(p.copy("abc", "../abc-evil/secret.txt", "dest.txt")).rejects.toThrow("Directory traversal");
});

test("copy rejects traversal in the destination path", async () => {
  await expect(p.copy("abc", "secret.txt", "../abc-evil/dest.txt")).rejects.toThrow("Directory traversal");
});

test("copy duplicates a file without removing the original", async () => {
  const projectId = `test-copy-file-${Date.now()}`;
  const baseDir = path.join(process.cwd(), "projects", projectId);
  try {
    await p.writeFile(projectId, "original.tex", "hello world");
    await p.copy(projectId, "original.tex", "duplicate.tex");
    expect(await p.readFile(projectId, "original.tex")).toBe("hello world");
    expect(await p.readFile(projectId, "duplicate.tex")).toBe("hello world");
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});

test("copy recursively duplicates a directory", async () => {
  const projectId = `test-copy-dir-${Date.now()}`;
  const baseDir = path.join(process.cwd(), "projects", projectId);
  try {
    await p.writeFile(projectId, "sections/intro.tex", "intro content");
    await p.copy(projectId, "sections", "sections-dup");
    expect(await p.readFile(projectId, "sections-dup/intro.tex")).toBe("intro content");
    expect(await p.readFile(projectId, "sections/intro.tex")).toBe("intro content");
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});
