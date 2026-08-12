# Spec: Eve `main-file` Tool

Give the Eve agent a single tool to check and change which `.tex` file a LaTeX project compiles as its root document.

## 1. Requirements

- Eve can report the project's current main/root `.tex` file when asked ("what's my main file?") without forcing a compile just to find out.
- Eve can change it when asked (e.g. "make chapters/thesis.tex the main file").
- One tool handles both: omit `path` to read the current value, pass `path` to change it.
- Change applies immediately (auto-apply, no confirmation prompt) — consistent with `write-file`/`move-file`.
- Rejects invalid targets: non-`.tex` paths, paths that don't exist in the project.
- The change is written through the exact same data path the settings-panel dropdown itself uses, so what Eve sets and what the panel shows can never disagree — see 2.1.
- The open settings-panel dropdown reflects the change without a manual reload.
- Does not touch the sibling `compilerEngine` setting.

## 2. Architecture & Components

### 2.1 Existing pieces this reuses

- `apps/editor/lib/project-settings.ts` — `ProjectSettings`, `DEFAULT_PROJECT_SETTINGS`, `PROJECT_SETTINGS_PATH`, `sanitizeProjectSettings()`, `readProjectSettings()`.
- `apps/editor/lib/storage.ts` — `storage.readFile`/`storage.writeFile`.
- `apps/editor/lib/authz.ts` — `resolveToolProject()`, `touchProject()`.
- `apps/editor/agent/lib/workspace.ts` — `workspaceFrom()`.
- Confirmed there is no explicit tool registry: `apps/editor/agent/agent.ts`'s `defineAgent()` only configures the model/limits, so every `defineTool()`-exporting file under `agent/tools/` is auto-discovered, same as the other tools already there (`move-file.ts`, `compile-project.ts`, etc.).

The tool calls `sanitizeProjectSettings()` + `storage.writeFile()` directly rather than going through `POST /api/project-settings` over HTTP. That route (`app/api/project-settings/route.ts`) does nothing more than those same two calls — it exists to give the *browser* a fetchable endpoint. Eve's tool already runs server-side in the same process, so calling the same two functions directly writes the identical bytes to the identical file; going through the HTTP route would add a network hop and require inventing a new internal auth secret (the route's own `requireProject` expects a Clerk browser session, which Eve's tool runtime doesn't have) for no behavioral difference.

### 2.2 New file: `apps/editor/agent/tools/main-file.ts`

Input schema:

```ts
{
  projectId: string;        // from the [projectId: ...] context marker
  path?: string;             // project-relative .tex path, e.g. "chapters/thesis.tex". Omit to just read the current value.
}
```

Execute (whole body wrapped in one try/catch, same shape as every other tool — `resolveToolProject` failing is as much a "failure" for a read as for a write):

1. `resolveToolProject(projectId, workspaceFrom(ctx))` → `pid`.
2. `current = await readProjectSettings(pid)`.
3. **`path` omitted → read mode:** return `{ ok: true, path: current.mainFilePath }` immediately. No storage write.
4. **`path` given → write mode:**
   - Reject if `!path.endsWith(".tex")`.
   - Reject if `storage.readFile(pid, path)` throws — doubles as the existence check; no new storage method needed.
   - `next = sanitizeProjectSettings({ ...current, mainFilePath: path })`.
   - `storage.writeFile(pid, PROJECT_SETTINGS_PATH, JSON.stringify(next))`.
   - `touchProject(pid)`.
   - Return `{ ok: true, path, previousPath: current.mainFilePath }`.
5. Anything thrown (bad project id, storage error) is caught and returned as the failure shape below — applies equally whether `path` was given or not.

Output:

```ts
// read success (path omitted from input)
{ ok: true, path: string }
// write success (path given in input)
{ ok: true, path: string, previousPath: string }
// failure — either mode: bad extension, target not found, or project resolution failed
{ ok: false, path: string, error: string }
```

`toModelOutput`: distinguishes on the presence of `previousPath`:
- No `previousPath` → `"The project's current main file is {path}."`
- `previousPath` present → `"Set the project's main file to {path} (was {previousPath})."`
- `ok: false` → `"Error setting main file to {path}: {error}"`

Tool description (for the model): "Reports or changes the project's configured root .tex file — the one compile-project uses by default and the one shown in the project's Settings panel. Omit `path` to check the current value; pass `path` to change it."

No UI card: tools without a custom `toolUI` already render through the generic `ToolFallback` (`thread.tsx:407`); a one-line confirmation doesn't need the diff/revert treatment `write-file`/`move-file` get in `eve-tool-calls.tsx`. A read-only call is even less card-worthy than a write.

### 2.3 Live refresh (two small edits to existing code)

- `apps/editor/hooks/use-eve-runtime.ts`: add `"main-file"` alongside `"write-file"`/`"delete-file"`/`"move"` in the tool-name check (~line 1005) that sets `shouldRefresh = true`, so a turn that calls this tool still dispatches `somescript:refresh-workspace`. Applied unconditionally (not just on the write path) — a redundant refresh on a read-only call is one harmless extra fetch, and branching on the tool's input there to skip it isn't worth the extra code. (This event also already fires unconditionally at end-of-turn via the `agent.status === "ready"` effect, so this is a belt-and-suspenders match with the other mutating tools, not the only trigger.)
- `apps/editor/app/page.tsx`: `handleRefreshWorkspace` (~line 2136) gets one added line, `void loadProjectSettings();`, alongside its existing `refreshWorkspace()`/`refreshCurrentFile()`/`collab.notifyFileTreeChanged()` calls, so the settings-panel dropdown picks up Eve's change. Since `loadProjectSettings()` does a plain `GET /api/project-settings` (see 2.1), it reads back exactly what the tool wrote — there is no separate "AI's value" to reconcile with the panel's value.

### 2.4 Docs: `apps/editor/agent/instructions.md`

New `### main-file` section after `### move-file`, matching the existing tools' style: when to use it for a check vs. a change, that a change validates `.tex` + existence, that it applies directly.

## 3. Out of scope

- No `[mainFile: ...]` context marker (mirroring `[projectId: ...]`/`[openFile: ...]`) — the merged tool's read mode covers "know the current value" on demand, without adding a few tokens to every outgoing message and without touching the shared `MARKER_KEYS`/strip-regex plumbing in `use-eve-runtime.ts` (which has unrelated uncommitted changes in this branch right now).
- `compilerEngine` is untouched — this tool only ever reads/changes `mainFilePath`.
- No auto-detect heuristic (the client's `detectMainFile`'s `\documentclass` search) — Eve can already `grep`/`list-files` itself if asked to find the right file before calling this tool.

## 4. Testing

`apps/editor/agent/tools/main-file.test.ts` (plain Bun test, no fixtures — matches `apps/editor/lib/edit-text.test.ts`'s pattern already in this branch):

- `path` omitted → returns the current `mainFilePath` unchanged, no storage write.
- valid `.tex` path that exists → settings written, `mainFilePath` updated, `compilerEngine` unchanged, response includes the correct `previousPath`.
- non-`.tex` path → rejected, storage untouched.
- `.tex` path that doesn't exist in the project → rejected, storage untouched.
