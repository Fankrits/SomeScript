# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SomeScript** is a LaTeX editing platform with three integrated surfaces:
- **`apps/web/`** — public marketing site, Clerk auth shell, workspace dashboard, project management
- **`apps/editor/`** — core LaTeX editor with CodeMirror, PDF preview, file tree, search, embedded Eve AI assistant
- **`apps/compiler/`** — standalone Bun service that runs Tectonic and returns compiled PDFs/logs

This is a Bun-managed Turbo monorepo. The root workspace is intentionally small; each app has its own `package.json` and dev scripts.

For high-level architecture, request flow, and storage model, see [OpenWiki architecture overview](openwiki/architecture.md).

## Implementation Policy: Find the Official Source First

Before writing custom logic for any non-trivial feature (parsers, protocol handling, format encoders/decoders, algorithms with a spec), search for the official/upstream open-source implementation and port or vendor it instead of hand-rolling it. Precedent: SyncTeX was originally a ~50-line hand-rolled `.synctex.gz` parser in `apps/compiler/index.ts`; it was replaced with the official `synctex` CLI (github.com/jlaurens/synctex, the same one TeX Live ships), built via `apps/compiler/scripts/build-synctex.sh` into `apps/compiler/bin/synctex`.

Checklist for new implementation work:
1. **Identify the spec/format/protocol involved** (e.g., SyncTeX, PDF, BibTeX, LaTeX macro expansion, S3 multipart, etc.).
2. **Search for the canonical open-source project** — the reference implementation, the tool the ecosystem actually uses (check what TeX Live / the relevant ecosystem ships), or a well-maintained library already solving it. Prefer the same engine already in this repo's dependency tree (Tectonic, embedpdf, etc.) over a new one.
3. **Prefer porting/vendoring/shelling out to that source** over writing a parser or algorithm from scratch. A small build script (see `apps/compiler/scripts/build-synctex.sh`) that compiles or vendors the upstream tool is preferable to reimplementing its logic.
4. **Only write custom code** when no suitable official implementation exists, or the official one is impractical to vendor (license, size, missing platform support) — and say so explicitly rather than silently reinventing it.
5. Document the upstream source (repo URL, version/commit) next to the vendoring code so it can be updated later.

This applies to every app in the monorepo, not just the compiler — e.g. LaTeX-adjacent parsing in the editor, citation/bibliography handling, PDF text extraction, etc.

## Critical Scope and Constraints

### You (Workspace Developer)
- **Scope**: Edit the monorepo code itself (`apps/editor/`, `apps/compiler/`, `apps/web/`).
- **Rule**: Never edit `apps/editor/my-new-project/` (the LaTeX sandbox) unless explicitly requested for verification or template defaults.
- **Next.js 16 Breaking Changes**: Read `node_modules/next/dist/docs/` before writing Next.js code. Middleware is now `proxy.ts`, not `middleware.ts`. Clerk middleware must include `'/__clerk/(.*)'` matcher.
- **Type Safety**: Always run `cd apps/editor && bun x tsc --noEmit` after editing Next.js pages or components.

### Embedded Eve Agent (apps/editor/agent/)
- **Scope**: LaTeX projects only; never explains monorepo structure to users.
- **Path Safety**: Always use `getProjectPath()` from `apps/editor/lib/project.ts` to prevent directory traversal.
- **UI Runtime**: Uses `@assistant-ui/react` with `useExternalStoreRuntime` — **branching is NOT supported**. Never re-add `<BranchPicker />`.

## Architecture Highlights

### Storage Abstraction
`apps/editor/lib/storage.ts` provides a unified interface for local filesystem and S3 storage. File paths are project-relative; directory traversal is guarded. The file tree excludes `node_modules`, `.git`, `.next`, `.eve`, `.workflow-data`.

### Project Path Resolution
`apps/editor/lib/project.ts` stores the current project path in a temp file. Falls back to local `my-new-project` if none selected. Project id is derived from the `projects/` segment in the path, or defaults to `default`.

### Compilation Flow
1. Editor calls `apps/editor/app/api/compile/route.ts`
2. Which proxies to `apps/compiler/index.ts` (port 3001)
3. Compiler spawns Tectonic, caches results, returns logs and base64 PDF

### Eve Assistant
- Defined in `apps/editor/components/chat/eve-thread.tsx`
- Tool renderers in `apps/editor/components/assistant-ui/eve-tool-calls.tsx`
- HITL tools (e.g., `ask_question`) map to `<HitlCard />` via `apps/editor/hooks/use-eve-runtime.ts`

## Commands

**From repo root (unless noted):**

- `bun install` — install workspace deps
- `bun dev` — runs `apps/web` (:3000) and `apps/editor` (:3002) via Turbo; compiler must be run separately
- `bun build` / `bun lint` — Turbo-orchestrated build/lint across `apps/web` and `apps/editor`

**Type-checking and testing (REQUIRED for changes to Next.js pages/components):**

- `cd apps/editor && bun x tsc --noEmit` — type-check after editing editor pages/components
- `cd apps/web && bun test` — run Bun tests; single file: `bun test components/hero-mockup.test.ts`
  - Note: `*.test.ts` files are excluded from `tsc` (see `apps/web/tsconfig.json`), so type-check and test separately

**Compiler service (separate process, port 3001):**

- `cd apps/compiler && bun --watch index.ts` (dev with auto-reload)
- `cd apps/compiler && bun index.ts` (start; requires `tectonic` on PATH)
- Health check: `curl http://localhost:3001/health`

**Editor app dev (if running in isolation):**

- `cd apps/editor && bun dev` — runs on port 3002

## Key Dependencies and Patterns

### UI Components
- **Editor**: CodeMirror 6 with custom LaTeX syntax highlight (`codemirror-lang-latex`)
- **PDF/Image Viewers**: `@embedpdf/react-pdf-viewer`
- **Chat/Assistant**: `@assistant-ui/react` with custom Eve runtime adapter
- **Base UI**: `@base-ui/react` for unstyled primitives; styled via Tailwind

### Storage and Auth
- **File Storage**: S3 via `@aws-sdk/client-s3` or local filesystem
- **Database**: Drizzle ORM (used in `apps/web/` for workspace/project metadata)
- **Auth**: Clerk (`@clerk/nextjs`); middleware in `apps/web/proxy.ts`

### Search and Compile
- **Search API**: `apps/editor/app/api/search/route.ts` — searches non-binary files with regex/case/word-boundary filters
- **Compile API**: `apps/editor/app/api/compile/route.ts` — proxies to compiler service; supports local and upload modes
- **File Serving**: `apps/editor/app/api/files/route.ts` — returns binary PDFs/images directly; text as JSON

## Common Tasks

**Adding UI to the editor:**
1. Add component to `apps/editor/components/`
2. Import in `apps/editor/app/page.tsx` (main editor layout)
3. Type-check: `cd apps/editor && bun x tsc --noEmit`
4. Run: `bun dev` (starts both apps)

**Modifying storage behavior:**
1. Update `apps/editor/lib/storage.ts` (storage abstraction)
2. Storage is used by file-serving, search, compile, and Eve tools
3. Changes affect both local dev and S3 paths

**Adding Eve tools:**
1. Define tool in `apps/editor/agent/` (e.g., `write-file.ts`)
2. Add renderer in `apps/editor/components/assistant-ui/eve-tool-calls.tsx` if needed
3. Update Eve system prompt in the runtime

**Updating compiler behavior:**
1. Edit `apps/compiler/index.ts`
2. Restart compiler service: `cd apps/compiler && bun index.ts`
3. Test via `POST http://localhost:3001/compile` or through editor UI

## Further Reading

For deeper dives, see:
- [OpenWiki quickstart](openwiki/quickstart.md) — entry point to all docs
- [Architecture overview](openwiki/architecture.md) — system boundaries, request flow, storage model
- [Editor app docs](openwiki/editor.md) — file operations, search, viewer architecture
- [Operations and compilation flow](openwiki/operations.md) — compiler modes, caching, differential sync
- [Auth, dashboard, and web app](openwiki/auth-and-web.md) — Clerk setup, workspace boundaries

See [AGENTS.md](AGENTS.md) for detailed agent guidance on scope, constraints, and Next.js 16 specifics.
