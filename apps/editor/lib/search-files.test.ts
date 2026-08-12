import { expect, test } from "bun:test";
import fs from "fs/promises";
import path from "path";
import { buildSearchPattern } from "./search-pattern";
import { isTextFile, searchFiles } from "./search-files";

test("isTextFile rejects known binary extensions and accepts the rest", () => {
  expect(isTextFile("figure.PNG")).toBe(false);
  expect(isTextFile("main.tex")).toBe(true);
  expect(isTextFile("refs.bib")).toBe(true);
  expect(isTextFile("Makefile")).toBe(true);
});

// The `storage` singleton searchFiles() uses is a LocalStorageProvider whenever
// STORAGE_PROVIDER is unset, so a temp project under projects/ exercises the real
// path: tree walk, exclusions, binary skip, and the match loop.
test("searchFiles reports 1-based lines and 0-based columns, honours the glob, skips binaries, and flags truncation", async () => {
  const projectId = `test-search-${Date.now()}`;
  const baseDir = path.join(process.cwd(), "projects", projectId);
  const { storage } = await import("./storage");

  try {
    await storage.writeFile(projectId, "main.tex", "\\documentclass{article}\nsee \\cite{knuth}\n");
    await storage.writeFile(projectId, "chapters/intro.tex", "intro \\cite{knuth} here\n");
    // Binary by extension, and it contains the query so a missed skip is visible.
    await storage.writeFile(projectId, "fig.png", "\\cite{knuth}");

    const all = await searchFiles(
      projectId,
      buildSearchPattern("\\cite{", {
        matchCase: false,
        matchWholeWord: false,
        useRegex: false,
      }),
    );

    expect(all.matches.map((m) => m.path).toSorted()).toEqual(["chapters/intro.tex", "main.tex"]);
    expect(all.truncated).toBe(false);

    const inMain = all.matches.find((m) => m.path === "main.tex")!;
    expect(inMain.line).toBe(2); // 1-based
    expect(inMain.column).toBe(4); // 0-based offset of "\cite{" in "see \cite{knuth}"
    expect(inMain.length).toBe(6);
    expect(inMain.text).toBe("see \\cite{knuth}"); // full, untruncated line

    // A glob over the full relative path, not the basename.
    const scoped = await searchFiles(
      projectId,
      buildSearchPattern("\\cite{", { matchCase: false, matchWholeWord: false, useRegex: false }),
      { pathGlob: "chapters/**" },
    );
    expect(scoped.matches.map((m) => m.path)).toEqual(["chapters/intro.tex"]);

    // Cap reached with files still unscanned.
    const capped = await searchFiles(
      projectId,
      buildSearchPattern("\\cite{", { matchCase: false, matchWholeWord: false, useRegex: false }),
      { maxResults: 1 },
    );
    expect(capped.matches).toHaveLength(1);
    expect(capped.truncated).toBe(true);
  } finally {
    await fs.rm(baseDir, { recursive: true, force: true });
  }
});
