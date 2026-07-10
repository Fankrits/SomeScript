## OpenWiki

This repository has documentation located in the /openwiki directory.

Start here:
- [OpenWiki quickstart](openwiki/quickstart.md)

OpenWiki includes repository overview, architecture notes, workflows, domain concepts, operations, integrations, testing guidance, and source maps.

When working in this repository, read the OpenWiki quickstart first, then follow its links to the relevant architecture, workflow, domain, operation, and testing notes.

## Commands

Bun-managed Turbo monorepo (`apps/web`, `apps/editor`, `apps/compiler`). Run from repo root unless noted.

- `bun install` — install all workspace deps
- `bun dev` — runs `apps/web` (:3000) and `apps/editor` (:3002) via Turbo; `apps/compiler` is not wired into root `dev`/`build`/`lint` and must be run separately
- `bun build` / `bun lint` — Turbo-orchestrated build/lint across `apps/web` and `apps/editor`
- `cd apps/editor && bun x tsc --noEmit` — type-check after editing editor pages/components (required by AGENTS.md)
- `cd apps/web && bun test` — run Bun tests (e.g. `apps/web/components/hero-mockup.test.ts`); single file: `bun test components/hero-mockup.test.ts`. Bun `*.test.ts` files are excluded from `tsc` (see `apps/web/tsconfig.json`), so type-check and test separately.
- `cd apps/compiler && bun --watch index.ts` (dev) / `bun index.ts` (start) — requires `tectonic` on PATH; serves `GET /health` and `POST /compile` on :3001

@AGENTS.md
