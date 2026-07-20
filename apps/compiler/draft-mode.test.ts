import { expect, test } from "bun:test";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { DRAFT_PREFIX, applyDraftMode } from "./draft-mode";

const SOURCE = "\\documentclass{article}\n\\begin{document}\n\\ref{fig:a}\n\\end{document}\n";

async function scratchTex() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "draft-mode-"));
  const file = path.join(dir, "main.tex");
  await fs.writeFile(file, SOURCE, "utf-8");
  return file;
}

const read = (f: string) => fs.readFile(f, "utf-8");

test("draft on prepends the prefix without adding a line", async () => {
  const file = await scratchTex();
  await applyDraftMode(file, true);
  const out = await read(file);

  expect(out.startsWith(DRAFT_PREFIX)).toBe(true);
  expect(out.endsWith(SOURCE)).toBe(true);
  // SyncTeX maps by line number: the prefix must share line 1 with \documentclass.
  expect(out.split("\n").length).toBe(SOURCE.split("\n").length);
});

test("repeated draft compiles do not stack prefixes", async () => {
  const file = await scratchTex();
  await applyDraftMode(file, true);
  await applyDraftMode(file, true);
  await applyDraftMode(file, true);

  expect(await read(file)).toBe(DRAFT_PREFIX + SOURCE);
});

test("turning draft off strips a prefix left in the workspace", async () => {
  const file = await scratchTex();
  await applyDraftMode(file, true);
  await applyDraftMode(file, false);

  expect(await read(file)).toBe(SOURCE);
});

test("draft off on a clean file is a no-op", async () => {
  const file = await scratchTex();
  await applyDraftMode(file, false);

  expect(await read(file)).toBe(SOURCE);
});
