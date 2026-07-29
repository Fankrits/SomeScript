---
type: Operations Guide
title: Operations and compilation flow
description: Compilation pipeline, file serving, search behavior, and operational environment for the SomeScript LaTeX editor.
tags: [operations, compilation, somescript, editor]
---

# Operations and compilation flow

This page covers how workspace files are compiled into PDFs and how file storage is served back to the editor.

## Compile flow

The compile path starts in `apps/editor/app/api/compile/route.ts`.

### Local mode

When `COMPILER_URL` points to localhost-style addresses, the editor defaults to `local` mode and proxies a compile request that includes:

- the resolved project path
- the relative path to the main `.tex` file
- the `draft` flag

The compiler service in `apps/compiler/index.ts` then runs Tectonic directly in the local project directory and streams logs back to the editor.

### Upload mode

When the compiler is remote, the editor uses `upload` mode:

1. It lists the full workspace through `storage.listProjectFiles()`.
2. It serializes text files directly and binary files as base64 payloads.
3. It computes a SHA-256 project hash for the upload payload.
4. It compares file hashes to a small in-memory cache so only changed files are sent when possible.
5. It posts the changed files, deleted files, and project hash to the compiler service.
6. If the compiler returns `requireFullSync`, the editor retries with a full workspace upload.
7. On success, the returned PDF is written back to storage as `<main>.pdf`.

This is the main performance-sensitive path in the repo and it is currently shaped by the recent “LaTeX compilation speedup” work in `docs/superpowers/specs/2026-07-01-latex-compilation-speedup-design.md`.

## Draft mode

The editor passes `draft: true` to the compiler when the user is in fast-compile mode. Draft mode was refactored from a simple `-r 0` Tectonic flag to a graphics-draft-prefix approach (`apps/compiler/draft-mode.ts`):

- Injects `\PassOptionsToPackage{draft}{graphicx}\PassOptionsToPackage{draft}{graphics}` before `\documentclass` to render images as empty boxes
- The prefix is deliberately on line 1 with no trailing newline so SyncTeX line numbers stay aligned with the user's source
- `applyDraftMode()` is idempotent both ways — strips an existing prefix when draft mode turns off, which is necessary because the upload workspace persists across compiles and a differential sync may not re-send the root file

**Note**: Draft mode was removed in commit `9357fa7` — the `apps/compiler/draft-mode.ts` and `apps/compiler/draft-mode.test.ts` files were deleted, and the Tectonic binary was bumped to 0.17.0. The draft mode concept is preserved here for historical context.

## Main file detection

`apps/editor/lib/main-file.ts` implements auto-detection of the LaTeX root document. The `pickDetectedMainFile()` function finds the unique `.tex` file containing `\documentclass` — only the root document has one, while `\input`/`\include`'d chapters don't. Ambiguous (0 or 2+ matches) returns null rather than guessing wrong.

This is used by the compile route (`apps/editor/app/api/compile/route.ts`) and the project export route (`apps/editor/app/api/project/export/route.ts`) to determine which file to compile when the user hasn't explicitly selected one.

## Rate limiting

`apps/editor/lib/rate-limit.ts` implements a per-user token bucket backed by Redis (`apps/editor/lib/redis.ts`) with in-memory fallback. Limits are enforced on:

- **Compile**: 10 requests per 60 seconds
- **Search**: 30 requests per 60 seconds
- **Upload**: 20 requests per 60 seconds

Rate limiting uses an atomic Lua script executed in Redis when `REDIS_URL` is set, with graceful fallback to an in-memory `Map<string, { tokens: number; last: number }>` if Redis is unavailable or unconfigured.

## Compiler service behavior

`apps/compiler/index.ts` exposes the following endpoints:

- `GET /health` returns `OK`
- `POST /compile` runs the compilation logic
- `POST /synctex` forwards SyncTeX queries to the official `synctex` CLI (`jlaurens/synctex`) for forward/inverse search

The compiler now uses the official SyncTeX binary (built by `scripts/build-synctex.sh`) instead of a hand-rolled parser (`3b8e078`).

Security additions since the last wiki update:

- **Shared-secret auth**: The compiler service checks a `COMPILER_SECRET` environment variable. If unset, a warning is logged.
- **Local-mode gate**: `ALLOW_LOCAL_COMPILE` must be explicitly `true` in production to accept arbitrary caller-supplied filesystem paths.
- **SyncTeX guards**: Path traversal is validated before SyncTeX execution.
- **Abort cleanup**: Compilation subprocesses are cleaned up on abort.

Important details:

- the compiler cleans stale workspaces older than 24 hours
- upload-mode workspaces live under `workspaces/{projectId}/`
- the service maintains an in-memory output cache keyed by project payload hash
- the service validates path traversal before reading or writing files
- PDFs are returned base64-encoded in upload mode

## File serving behavior

`apps/editor/app/api/files/route.ts` is the canonical file-serving route for the editor UI.

### GET behavior

- `?path=<file>` on a text file returns JSON with `{ content }`
- PDFs are returned as binary `application/pdf`
- images are returned as binary with the correct image MIME type
- when no file path is supplied, the route returns the project tree and relative project path

### POST behavior

`POST /api/files` supports:

- switching the active project path
- creating files or directories
- saving file contents
- moving files or directories
- deleting files or directories

On project path switch, the route seeds a default `main.tex` if the project does not already contain one.

### File upload

`POST /api/files/upload` (`apps/editor/app/api/files/upload/route.ts`) supports batch file upload via `multipart/form-data`:

- Rate limited to 20 requests per 60 seconds
- Max upload size: 250 MB (compressed)
- Files are deduplicated via `dedupeUploadName()` — appends `-1`, `-2`, etc. before the extension on collision
- All upload batch sizes are validated before writing any file to prevent partial uploads

## Search behavior

The search route at `apps/editor/app/api/search/route.ts` skips binary files and only scans text-like files. That keeps search aligned with editor expectations and avoids accidentally decoding PDFs or images as text.

The route has both search and replace behavior, so future changes need to preserve:

- zero-width regex handling
- whole-word validation
- line-range filtering
- replacement counts per file

## Operational environment

Several environment-dependent behaviors show up in the source:

- `COMPILER_URL` and `COMPILER_MODE` control how the editor reaches the compiler
- `REDIS_URL` configures shared Redis for rate limiting, file diff hashes, and compile caches
- `AWS_*` settings configure S3-backed storage
- `CLERK_WEBHOOK_SECRET` secures auth webhooks in `apps/web/app/api/webhooks/clerk/route.ts`
- the active project path is stored in a temp config file, not in the database

The repo does not currently expose a single centralized ops guide, so this page is the main canonical home for compilation and file-serving behavior.

## Railway Redis Deployment & Scaling Guide (1,000 - 10,000+ Concurrent Users)

To scale the SomeScript editor and compiler across multiple Railway instances:

1. **Add Redis Database on Railway:**
   - In your Railway project canvas, click **+ New** -> **Database** -> **Add Redis**.
   - Railway will generate a `REDIS_URL` variable (formatted as `redis://default:password@host:port`).

2. **Connect Editor & Compiler Services:**
   - In Railway Service Settings for `apps/editor`: Add Environment Variable `REDIS_URL=${{Redis.REDIS_URL}}`.
   - In Railway Service Settings for `apps/compiler`: Add Environment Variable `REDIS_URL=${{Redis.REDIS_URL}}`.

3. **Horizontal Scaling:**
   - Increase Railway replica count for `apps/editor` (e.g., 3-5 replicas).
   - Increase Railway replica count for `apps/compiler` (e.g., 2-4 replicas).
   - Shared Redis guarantees synchronized rate limits, file diff hashes, and PDF compile caches across all nodes.

4. **Memory:** every key this app writes carries a TTL, but the compile cache stores full base64 PDFs, so an unbounded Redis (the default) can fill up before TTLs expire — once it's full, `noeviction` (Redis's default policy) starts rejecting writes for every feature sharing the instance, not just the cache. Set a memory limit and `volatile-lru` eviction on the Railway Redis service (equivalent to the `docker-compose.yml` local setup) rather than relying on TTLs alone.

## Source references

- `apps/editor/app/api/compile/route.ts`
- `apps/editor/app/api/files/route.ts`
- `apps/editor/app/api/search/route.ts`
- `apps/editor/app/api/synctex/route.ts`
- `apps/editor/app/api/health/route.ts`
- `apps/editor/lib/rate-limit.ts`
- `apps/editor/lib/redis.ts`
- `apps/editor/lib/storage.ts`
- `apps/editor/lib/authz.ts`
- `apps/compiler/index.ts`
- `apps/compiler/draft-mode.ts`
- `apps/compiler/scripts/build-synctex.sh`

