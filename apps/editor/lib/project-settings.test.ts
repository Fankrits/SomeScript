import { expect, test } from "bun:test";
import {
  setMainFile,
  PROJECT_SETTINGS_PATH,
  DEFAULT_PROJECT_SETTINGS,
} from "./project-settings";

// Minimal in-memory stand-in for the two StorageProvider methods setMainFile
// needs. Keyed by path only (single project) — good enough for these tests,
// which never touch more than one projectId.
function fakeStorage(files: Record<string, string>) {
  return {
    async readFile(_projectId: string, path: string) {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return files[path];
    },
    async writeFile(_projectId: string, path: string, content: string | Buffer) {
      files[path] = content.toString();
    },
  };
}

test("setMainFile rejects a non-.tex path without touching storage", async () => {
  const files: Record<string, string> = { "notes.md": "hi" };
  const result = await setMainFile("p1", "notes.md", fakeStorage(files));

  expect(result).toEqual({ ok: false, error: "only .tex files can be the main file" });
  expect(files[PROJECT_SETTINGS_PATH]).toBeUndefined();
});

test("setMainFile rejects a .tex path that doesn't exist in the project", async () => {
  const files: Record<string, string> = {};
  const result = await setMainFile("p1", "ghost.tex", fakeStorage(files));

  expect(result).toEqual({ ok: false, error: "no such file in the project" });
  expect(files[PROJECT_SETTINGS_PATH]).toBeUndefined();
});

test("setMainFile writes settings, preserves compilerEngine, and reports the previous value", async () => {
  const files: Record<string, string> = {
    "thesis.tex": "\\documentclass{report}",
    [PROJECT_SETTINGS_PATH]: JSON.stringify({ mainFilePath: "main.tex", compilerEngine: "xelatex" }),
  };
  const result = await setMainFile("p1", "thesis.tex", fakeStorage(files));

  expect(result).toEqual({
    ok: true,
    mainFilePath: "thesis.tex",
    previousMainFilePath: "main.tex",
  });
  expect(JSON.parse(files[PROJECT_SETTINGS_PATH])).toEqual({
    mainFilePath: "thesis.tex",
    compilerEngine: "xelatex",
  });
});

test("setMainFile falls back to DEFAULT_PROJECT_SETTINGS when no settings file exists yet", async () => {
  const files: Record<string, string> = { "other.tex": "\\documentclass{article}" };
  const result = await setMainFile("p1", "other.tex", fakeStorage(files));

  expect(result).toEqual({
    ok: true,
    mainFilePath: "other.tex",
    previousMainFilePath: DEFAULT_PROJECT_SETTINGS.mainFilePath,
  });
});
