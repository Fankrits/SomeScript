import { expect, test } from "bun:test";
import { DEFAULT_EDITOR_PREFS, readEditorPrefs, sanitizeEditorPrefs } from "./editor-prefs-storage";

// --- readEditorPrefs ---------------------------------------------------------

test("missing or unreadable file reads back as defaults", async () => {
  const s = {
    readFile: async () => {
      throw new Error("ENOENT");
    },
  };
  expect(await readEditorPrefs("u1", "p1", s)).toEqual(DEFAULT_EDITOR_PREFS);
});

test("unparseable file reads back as defaults", async () => {
  expect(await readEditorPrefs("u1", "p1", { readFile: async () => "not json" })).toEqual(
    DEFAULT_EDITOR_PREFS,
  );
});

test("readEditorPrefs round-trips a well-formed blob", async () => {
  const stored = {
    tooltipsEnabled: false,
    vimModeEnabled: true,
    foldingEnabled: false,
    autocompleteEnabled: false,
    bracketMatchingEnabled: false,
    lastOpenFile: "main.tex",
  };
  const s = { readFile: async () => JSON.stringify(stored) };
  expect(await readEditorPrefs("u1", "p1", s)).toEqual(stored);
});

// --- sanitizeEditorPrefs ------------------------------------------------------

test("sanitizeEditorPrefs falls back to defaults for non-object input", () => {
  expect(sanitizeEditorPrefs(null)).toEqual(DEFAULT_EDITOR_PREFS);
  expect(sanitizeEditorPrefs("garbage")).toEqual(DEFAULT_EDITOR_PREFS);
});

test("sanitizeEditorPrefs coerces non-boolean fields to their defaults", () => {
  const prefs = sanitizeEditorPrefs({
    tooltipsEnabled: "yes",
    vimModeEnabled: 1,
    foldingEnabled: null,
  });
  expect(prefs.tooltipsEnabled).toBe(true);
  expect(prefs.vimModeEnabled).toBe(false);
  expect(prefs.foldingEnabled).toBe(true);
});

test("sanitizeEditorPrefs keeps well-formed boolean fields intact", () => {
  const prefs = sanitizeEditorPrefs({
    tooltipsEnabled: false,
    vimModeEnabled: true,
    foldingEnabled: false,
    autocompleteEnabled: false,
    bracketMatchingEnabled: false,
  });
  expect(prefs).toMatchObject({
    tooltipsEnabled: false,
    vimModeEnabled: true,
    foldingEnabled: false,
    autocompleteEnabled: false,
    bracketMatchingEnabled: false,
  });
});

test("sanitizeEditorPrefs keeps a well-formed lastOpenFile and truncates an oversized one", () => {
  expect(sanitizeEditorPrefs({ lastOpenFile: "chapters/intro.tex" }).lastOpenFile).toBe(
    "chapters/intro.tex",
  );
  expect(sanitizeEditorPrefs({ lastOpenFile: "x".repeat(5000) }).lastOpenFile?.length).toBe(2000);
});

test("sanitizeEditorPrefs drops a non-string lastOpenFile to null", () => {
  expect(sanitizeEditorPrefs({ lastOpenFile: 42 }).lastOpenFile).toBeNull();
  expect(sanitizeEditorPrefs({}).lastOpenFile).toBeNull();
});
