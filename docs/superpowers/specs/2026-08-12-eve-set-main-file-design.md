# Spec: Eve `set-main-file` Tool

Give the Eve agent a tool to change which `.tex` file a LaTeX project compiles as its root document.

## 1. Requirements

- Eve can set the project's main/root `.tex` file when the user asks (e.g. "make chapters/thesis.tex the main file").
- Change applies immediately (auto-apply, no confirmation prompt) — consistent with `write-file`/`move-file`.
- Rejects invalid targets: non-`.tex` paths, paths that don't exist in the project.
- The user's open settings-panel dropdown reflects the change without a manual reload.
- Does not touch the sibling `compilerEngine` setting.

## 2. Architecture & Components

### 2.1 Existing pieces this reuses

- `apps/editor/lib/project-settings.ts` — `ProjectSettings`, `DEFAULT_PROJECT_SETTINGS`, `PROJECT_SETTINGS_PATH`, `sanitizeProjectSettings()`, `readProjectSettings()`.
- `apps/editor/lib/storage.ts` — `storage.readFile`/`storage.writeFile`.
- `apps/editor/lib/authz.ts` — `resolveToolProject()`, `touchProject()`.
- `apps/editor/agent/lib/workspace.ts` — `workspaceFrom()`.
- Confirmed there is no explicit tool registry: `apps/editor/agent/agent.ts`'s `defineAgent()` only configures the model/limits, so every `defineTool()`-exporting file under `agent/tools/` is auto-discovered, same as the other tools already there (`move-file.ts`, `compile-project.ts`, etc.).

### 2.2 New file: `apps/editor/agent/tools/set-main-file.ts`

Modeled directly on `move-file.ts`.

Input schema:

```ts
{
  projectId: string; // from the [projectId: ...] context marker
  path: string;      // project-relative .tex path, e.g. "chapters/thesis.tex"
}
```

Execute:

1. `resolveToolProject(projectId, workspaceFrom(ctx))` → `pid`.
2. Reject if `!path.endsWith(".tex")`.
3. Reject if `storage.readFile(pid, path)` throws — doubles as the existence check; no new storage method needed.
4. `current = await readProjectSettings(pid)`.
5. `next = sanitizeProjectSettings({ ...current, mainFilePath: path })`.
6. `storage.writeFile(pid, PROJECT_SETTINGS_PATH, JSON.stringify(next))`.
7. `touchProject(pid)`.

Output:

```ts
// success
{ ok: true, path: string, previousPath: string }
// failure
{ ok: false, path: string, error: string }
```

`toModelOutput`: `"Set the project's main file to {path} (was {previousPath})."` on success; `"Error setting main file to {path}: {error}"` on failure — same one-line-text pattern as `move-file.ts`/`write-file.ts`.

No UI card: tools without a custom `toolUI` already render through the generic `ToolFallback` (`thread.tsx:407`); a one-line confirmation doesn't need the diff/revert treatment `write-file`/`move-file` get in `eve-tool-calls.tsx`.

### 2.3 Live refresh (two small edits to existing code)

- `apps/editor/hooks/use-eve-runtime.ts`: add `"set-main-file"` alongside `"write-file"`/`"delete-file"`/`"move"` in the tool-name check (~line 1005) that sets `shouldRefresh = true`, so a turn that only calls this tool still dispatches `somescript:refresh-workspace`. (This event also already fires unconditionally at end-of-turn via the `agent.status === "ready"` effect, so this is a belt-and-suspenders match with the other mutating tools, not the only trigger.)
- `apps/editor/app/page.tsx`: `handleRefreshWorkspace` (~line 2136) gets one added line, `void loadProjectSettings();`, alongside its existing `refreshWorkspace()`/`refreshCurrentFile()`/`collab.notifyFileTreeChanged()` calls, so the settings-panel dropdown picks up Eve's change.

### 2.4 Docs: `apps/editor/agent/instructions.md`

New `### set-main-file` section after `### move-file`, matching the existing tools' style (when to use it, that it validates `.tex` + existence, that it applies directly).

## 3. Out of scope

- No read-only tool or `[mainFile: ...]` context marker (mirroring `[projectId: ...]`/`[openFile: ...]`) — the set-tool's own `path`/`previousPath` response is enough for Eve to answer "what's the main file" in chat. Add later if Eve is regularly asked to report the setting without changing it.
- `compilerEngine` is untouched — this tool only ever changes `mainFilePath`.
- No auto-detect heuristic (the client's `detectMainFile`'s `\documentclass` search) — Eve can already `grep`/`list-files` itself if asked to find the right file before calling this tool.

## 4. Testing

`apps/editor/agent/tools/set-main-file.test.ts` (plain Bun test, no fixtures — matches `apps/editor/lib/edit-text.test.ts`'s pattern already in this branch):

- valid `.tex` path that exists → settings written, `mainFilePath` updated, `compilerEngine` unchanged.
- non-`.tex` path → rejected, storage untouched.
- `.tex` path that doesn't exist in the project → rejected, storage untouched.
