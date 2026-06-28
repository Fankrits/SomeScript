# Workspace Agent Rules: LaTeX Editor (v0 for LaTeX)

This file defines constraints, architectural rules, and guidelines for any AI coding assistant (like Antigravity) working on the codebase of this repository.

---

## 1. Project Context & Scope Distinction

This project is a monorepo consisting of:
- **The Editor App**: The Next.js parent application (`apps/editor/`) that acts as a web-based IDE/editor for LaTeX.
- **The Embedded Agent**: An Eve-based assistant (`apps/editor/agent/`) that operates *inside* the Editor App to write and manage LaTeX files.
- **The User LaTeX Project**: The actual document directories (e.g., `my-new-project/` or dynamically loaded paths via `active-project.json`) that are being edited by the user/embedded agent.

> [!IMPORTANT]
> **Do not confuse the scopes:**
> - As the workspace AI developer, your scope is **The Editor App** (Next.js components, compile API routes, the Eve runtime integrations).
> - The embedded assistant's scope is **The User LaTeX Project** (writing `.tex` and `.bib` files, generating compilable templates). Keep the embedded assistant's prompt (`apps/editor/agent/instructions.md`) focused strictly on LaTeX and files within the active project path.

---

## 2. Next.js & Turbopack Constraints

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

- Always test with `bun x tsc --noEmit` and verify builds when making Next.js page or component edits.

---

## 3. UI & Chat Integration Rules (`@assistant-ui/react`)

The chat window is powered by `@assistant-ui/react` and integrated with Eve via a custom runtime adapter (`apps/editor/hooks/use-eve-runtime.ts`).

### 🚫 Branching is NOT supported
- The UI uses `useExternalStoreRuntime` which does not support message branching or branch histories.
- **Never re-add or render the `<BranchPicker />` component** in `apps/editor/components/assistant-ui/thread.tsx`. Doing so will cause runtime crashes ("Runtime does not support switching branches").

### 🛠️ HITL and Tool Call Rendering
- All tool calls from the Eve agent are intercepted and mapped in `use-eve-runtime.ts`.
- Human-In-The-Loop (HITL) tools (specifically `ask_question`) must render using the custom `<HitlCard />` from `apps/editor/components/assistant-ui/eve-tool-calls.tsx`.
- The runtime maps `part.toolName === "ask_question"` or the presence of `inputRequest` to the `__hitl__` type before the tool transitions to approval states. Do not alter this mapping schema or alias registry without careful regression testing.

---

## 4. LaTeX Compiler & Project Workspace APIs

- **Compiler Routing**: The compilation route (`apps/editor/app/api/compile/route.ts`) switches between a local compiler process (running locally on port 3001) and a remote compiler service (`COMPILER_URL` env var) that receives the full project file tree base64-encoded. Ensure both branches are maintained when editing compile APIs.
- **Path Resolution**: Always resolve file paths relative to `getProjectPath()` (defined in `apps/editor/lib/project.ts`) to avoid leaking system files or writing outside the active LaTeX project sandbox.
