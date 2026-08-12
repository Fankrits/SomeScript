# Eve `main-file` Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Eve agent a tool that reports and changes a LaTeX project's configured root `.tex` file, and make the editor's Settings panel reflect that change live.

**Architecture:** A new `setMainFile()` function is added to the existing `apps/editor/lib/project-settings.ts` (next to its `readProjectSettings`/`sanitizeProjectSettings`), following that file's own storage-injectable pattern so it's unit-testable without touching real storage. A new Eve tool, `apps/editor/agent/tools/main-file.ts`, is a thin wrapper around that function plus the existing `readProjectSettings` — exactly the shape every other tool in that directory already has (auth → call `lib/` function → shape output), and it is auto-discovered with no registry changes. Two one-line edits wire the existing post-turn refresh mechanism (`apps/editor/hooks/use-eve-runtime.ts` → `apps/editor/app/page.tsx`) to also reload settings, so the panel shows Eve's change without a manual reload.

**Tech Stack:** TypeScript, Bun (`bun:test`), Next.js 16, Zod, `eve/tools`.

## Global Constraints

- No new dependencies — everything needed (`zod`, `eve/tools`) is already installed and used by sibling tools.
- Tools in `apps/editor/agent/tools/` are auto-discovered by filename; there is no registry file to update (verified: `apps/editor/agent/agent.ts`'s `defineAgent()` only configures model/limits).
- Tests are plain `bun:test`, no fixtures/mocking framework, matching `apps/editor/lib/edit-text.test.ts` and `apps/editor/lib/authz.test.ts`.
- Per this codebase's established convention, Eve tool *wrapper* files (`agent/tools/*.ts`) are not unit-tested directly anywhere in this repo — only their underlying `lib/*.ts` logic is. Follow that: the new logic goes in `lib/project-settings.ts` and is tested there; `main-file.ts` itself is verified by type-check, not a dedicated test file.
- Never write to `apps/editor/my-new-project/` (the real local LaTeX sandbox) from a test — use an injected fake storage object instead (see Task 1).
- After editing `apps/editor/app/page.tsx`, run `cd apps/editor && bun x tsc --noEmit` (required by this repo's CLAUDE.md for any Next.js page/component change).

---

### Task 1: Add `setMainFile()` to `apps/editor/lib/project-settings.ts`

**Files:**
- Modify: `apps/editor/lib/project-settings.ts` (currently 40 lines — add one new exported function + type at the end)
- Create: `apps/editor/lib/project-settings.test.ts`

**Interfaces:**
- Consumes: `ProjectSettings`, `DEFAULT_PROJECT_SETTINGS`, `PROJECT_SETTINGS_PATH`, `sanitizeProjectSettings()`, `readProjectSettings()`, `storage`, `StorageProvider` — all already defined in this file.
- Produces (for Task 2):
  ```ts
  type SetMainFileResult =
    | { ok: true; mainFilePath: string; previousMainFilePath: string }
    | { ok: false; error: string };

  function setMainFile(
    projectId: string,
    path: string,
    s?: Pick<StorageProvider, "readFile" | "writeFile">, // defaults to the real `storage` singleton
  ): Promise<SetMainFileResult>;
  ```

- [ ] **Step 1: Write the failing tests**

Create `apps/editor/lib/project-settings.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/editor && bun test lib/project-settings.test.ts`
Expected: FAIL — `setMainFile` is not exported from `./project-settings` (TypeError / module has no export).

- [ ] **Step 3: Implement `setMainFile`**

Open `apps/editor/lib/project-settings.ts`. It currently ends with `readProjectSettings` (the `catch { return { ...DEFAULT_PROJECT_SETTINGS }; }` closing brace is the last line). Append:

```ts
export type SetMainFileResult =
  | { ok: true; mainFilePath: string; previousMainFilePath: string }
  | { ok: false; error: string };

/**
 * Validates and persists a new mainFilePath. The existence check matters: a
 * mainFilePath pointing at a file that isn't there would silently break
 * every future compile-project call instead of failing here, once, clearly.
 */
export async function setMainFile(
  projectId: string,
  path: string,
  s: Pick<StorageProvider, "readFile" | "writeFile"> = storage,
): Promise<SetMainFileResult> {
  if (!path.endsWith(".tex")) {
    return { ok: false, error: "only .tex files can be the main file" };
  }

  try {
    await s.readFile(projectId, path);
  } catch {
    return { ok: false, error: "no such file in the project" };
  }

  const current = await readProjectSettings(projectId, s);
  const next = sanitizeProjectSettings({ ...current, mainFilePath: path });
  await s.writeFile(projectId, PROJECT_SETTINGS_PATH, JSON.stringify(next));

  return { ok: true, mainFilePath: path, previousMainFilePath: current.mainFilePath };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/editor && bun test lib/project-settings.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 5: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add apps/editor/lib/project-settings.ts apps/editor/lib/project-settings.test.ts
git commit -m "feat(editor): add setMainFile to project-settings lib"
```

---

### Task 2: Create the `main-file` Eve tool and document it

**Files:**
- Create: `apps/editor/agent/tools/main-file.ts`
- Modify: `apps/editor/agent/instructions.md:88-92` (insert a new section right after the existing `### move-file` section, before `### cite-search`)

**Interfaces:**
- Consumes: `defineTool` (`eve/tools`), `z` (`zod`), `resolveToolProject`/`touchProject` (`apps/editor/lib/authz.ts`), `workspaceFrom` (`apps/editor/agent/lib/workspace.ts`), `readProjectSettings`/`setMainFile` (`apps/editor/lib/project-settings.ts`, the latter from Task 1).
- Produces: an Eve tool auto-registered under the name `main-file` (no other task depends on this directly, but Task 3 references this exact name as a string literal in `use-eve-runtime.ts`).

- [ ] **Step 1: Create the tool file**

Create `apps/editor/agent/tools/main-file.ts`:

```ts
import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject, touchProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { readProjectSettings, setMainFile } from "../../lib/project-settings";

interface MainFileOutput {
  ok: boolean;
  path: string;
  previousPath?: string;
  error?: string;
}

export default defineTool({
  description:
    "Reports or changes the project's configured root .tex file — the one compile-project uses by default and the one shown in the project's Settings panel. Omit path to check the current value; pass path to change it.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z
      .string()
      .optional()
      .describe(
        "Project-relative .tex path to make the new main file, e.g. 'chapters/thesis.tex'. Omit to just report the current main file.",
      ),
  }),
  async execute({ projectId, path }, ctx) {
    try {
      const pid = await resolveToolProject(projectId, workspaceFrom(ctx));

      if (path === undefined) {
        const current = await readProjectSettings(pid);
        return { ok: true as const, path: current.mainFilePath };
      }

      const result = await setMainFile(pid, path);
      if (!result.ok) {
        return { ok: false as const, path, error: result.error };
      }

      await touchProject(pid);
      return {
        ok: true as const,
        path: result.mainFilePath,
        previousPath: result.previousMainFilePath,
      };
    } catch (e) {
      return {
        ok: false as const,
        path: path ?? "",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
  toModelOutput(output) {
    const out = output as MainFileOutput;
    if (!out.ok) {
      return { type: "text", value: `Error setting main file to ${out.path}: ${out.error ?? "unknown error"}` };
    }
    return {
      type: "text",
      value:
        out.previousPath !== undefined
          ? `Set the project's main file to ${out.path} (was ${out.previousPath}).`
          : `The project's current main file is ${out.path}.`,
    };
  },
});
```

- [ ] **Step 2: Document the tool**

Open `apps/editor/agent/instructions.md`. Find the `### move-file` section (ends at line 92, right before the blank line and `### cite-search` on line 94):

```
### move-file

- Use to rename a file or move it into a different folder within the project
- Applies **directly**; the UI shows a "moved" card the user can **revert**
- Paths are relative to the project root, same as `read-file`/`write-file`

### cite-search
```

Insert a new section between them:

```
### move-file

- Use to rename a file or move it into a different folder within the project
- Applies **directly**; the UI shows a "moved" card the user can **revert**
- Paths are relative to the project root, same as `read-file`/`write-file`

### main-file

- Use to check or change which `.tex` file `compile-project` treats as the root document — the same setting the user's Settings panel controls
- Omit `path` to just report the current main file (e.g. the user asks "what's my main file?"). This does not compile or touch storage.
- Pass `path` to change it. Applies **directly**, no approval prompt. Fails if `path` isn't a `.tex` file or doesn't exist in the project — read `list-files` first if you're not sure of the exact path.
- The user's Settings panel updates to match automatically; you don't need to tell them to change it there too

### cite-search
```

- [ ] **Step 3: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no new errors. (This is the verification step for this task — per this repo's established convention, `agent/tools/*.ts` files are thin wrappers that aren't unit-tested directly anywhere in this codebase; their logic was already covered in Task 1.)

- [ ] **Step 4: Commit**

```bash
git add apps/editor/agent/tools/main-file.ts apps/editor/agent/instructions.md
git commit -m "feat(eve): add main-file tool to check/change the project's root .tex file"
```

---

### Task 3: Wire the settings panel to refresh after Eve changes the main file

**Files:**
- Modify: `apps/editor/hooks/use-eve-runtime.ts:1004-1013`
- Modify: `apps/editor/app/page.tsx:2136-2140` and `apps/editor/app/page.tsx:2203-2211`

**Interfaces:**
- Consumes: the tool name string `"main-file"` (must match Task 2's filename-derived tool name exactly), the existing `loadProjectSettings` (`useCallback`, defined earlier in `page.tsx`, already used the same way at `page.tsx:1457`).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Add `main-file` to the refresh-trigger check**

In `apps/editor/hooks/use-eve-runtime.ts`, find (around line 1004):

```ts
              const name = part.toolName;
              if (
                name === "write_file" ||
                name === "write-file" ||
                name === "delete_file" ||
                name === "delete-file" ||
                name === "move"
              ) {
                shouldRefresh = true;
              }
```

Replace with:

```ts
              const name = part.toolName;
              if (
                name === "write_file" ||
                name === "write-file" ||
                name === "delete_file" ||
                name === "delete-file" ||
                name === "move" ||
                name === "main-file"
              ) {
                shouldRefresh = true;
              }
```

- [ ] **Step 2: Reload project settings on workspace refresh**

In `apps/editor/app/page.tsx`, find (around line 2136):

```ts
    const handleRefreshWorkspace = () => {
      void refreshWorkspace();
      void refreshCurrentFile();
      collab.notifyFileTreeChanged();
    };
```

Replace with:

```ts
    const handleRefreshWorkspace = () => {
      void refreshWorkspace();
      void refreshCurrentFile();
      void loadProjectSettings();
      collab.notifyFileTreeChanged();
    };
```

Then find the `useEffect`'s dependency array that closes this same effect (around line 2203):

```ts
  }, [
    refreshWorkspace,
    refreshCurrentFile,
    handleFileSelect,
    projectId,
    withProject,
    collab,
    saveCurrentFile,
  ]);
```

Replace with:

```ts
  }, [
    refreshWorkspace,
    refreshCurrentFile,
    loadProjectSettings,
    handleFileSelect,
    projectId,
    withProject,
    collab,
    saveCurrentFile,
  ]);
```

- [ ] **Step 3: Type-check**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: no new errors (in particular, no `react-hooks/exhaustive-deps`-style complaint about `loadProjectSettings` — it's already a stable `useCallback` referenced the same way elsewhere in this file).

- [ ] **Step 4: Manual verification (required for this UI change — see CLAUDE.md)**

This wiring only shows up in a live, authenticated session — there's no automated test for React effect wiring in this codebase, and per this project's own guidance, auth must not be bypassed to check UI behavior (`apps/editor` sits behind Clerk). With the editor and compiler running (`bun dev` from repo root, plus `cd apps/compiler && bun index.ts`), in a logged-in browser session against a project with more than one `.tex` file:

1. Open the project's Settings panel, note the current "main file" value.
2. In the Eve chat, ask "what's the current main file?" — Eve should answer with that same value, with no compile and no file-tree change.
3. Ask Eve to "set the main file to `<some other .tex file in the project>`".
4. Confirm: Eve confirms the change in chat, and the Settings panel's main-file field updates to the new value without a manual page reload.
5. Ask Eve to set the main file to a nonexistent path (e.g. `no-such-file.tex`) — confirm it reports an error and the Settings panel value is unchanged.

- [ ] **Step 5: Commit**

```bash
git add apps/editor/hooks/use-eve-runtime.ts apps/editor/app/page.tsx
git commit -m "feat(editor): refresh settings panel after Eve changes the main file"
```
