---
type: Operations Guide
title: Operations and compilation flow
description: Compilation pipeline, Redis infrastructure, collaboration service, file serving, and operational environment for the SomeScript LaTeX editor.
tags: [operations, compilation, somescript, editor, redis, collaboration]
---

# Operations and compilation flow

This page covers how workspace files are compiled into PDFs, how Redis enables shared infrastructure, and how the collaboration service works.

## Redis infrastructure

`apps/editor/lib/redis.ts` provides a centralized ioredis v6 client with the following design:

- **Lazy connect**: The client calls `.connect()` on creation but sets `lazyConnect: true` so connection errors don't crash startup.
- **RESP2 protocol**: Pinned via `protocol: 2` (`e42ce67`) because the deployed Redis/Valkey version's RESP3 support is unverified.
- **Permanent retry strategy**: `retryStrategy` caps backoff at 2s and retries forever — returning `null` would stop ioredis's reconnection loop permanently, trapping the app in in-memory fallback mode after a transient outage.
- **Graceful fallback**: Every exported function (`redisGet`, `redisSet`, `redisHSet`, `redisHGetAll`, `redisHDel`) returns a falsy sentinel on error or disconnection, so callers can degrade to in-memory fallback without checking client status.

### Fallbacks when Redis is unavailable

| Feature | Fallback | Location |
|---------|----------|----------|
| Rate limiting | In-memory `Map<string, { tokens: number; last: number }>` (capped at `MAX_BUCKETS=10000`) | `apps/editor/lib/rate-limit.ts` |
| Diff-sync hashes | In-memory `Map<string, string>` (capped at `MAX_FALLBACK_ENTRIES=10000`) | `apps/editor/lib/compile.ts` |
| Compile output cache | Compiler falls through to running Tectonic | `apps/compiler/index.ts` |
| Hocuspocus awareness | No Redis extension → single-replica operation | `apps/collaboration/server.ts` |

Each fallback is bounded so a prolonged outage cannot grow it unboundedly.

## Compile flow

The compile path starts in `apps/editor/app/api/compile/route.ts`. The shared compile logic lives in `apps/editor/lib/compile.ts`, which is imported by both the API route and the Eve agent's `compile-project` tool. That module has three constraints: relative imports only (no `@/` alias), no `next/server`, and no `lib/rate-limit` (which top-level-imports Clerk), because the agent bundles into eve's Node runtime.

### Local mode

When `COMPILER_URL` points to localhost-style addresses, the editor defaults to `local` mode and proxies a compile request that includes:

- the resolved project path
- the relative path to the main `.tex` file

The compiler service in `apps/compiler/index.ts` then runs Tectonic directly in the local project directory and streams logs back to the editor.

### Upload mode (production path)

When the compiler is remote, the editor uses `upload` mode:

1. It lists the full workspace through `storage.listProjectFiles()`.
2. It serializes text files directly and binary files as base64 payloads.
3. It computes a SHA-256 project hash for the upload payload.
4. It reads file hashes from Redis (`project:{projectId}:hashes`), falling back to an in-memory Map (capped at 10K entries), so only changed files are sent.
5. It posts the changed files, deleted files, and project hash to the compiler service.
6. If the compiler returns `requireFullSync`, the editor retries with a full workspace upload.
7. On success, the returned PDF is written back to storage as `<stem>.pdf` under `.preview-cache/`.

### Compile log persistence

After each compile, the log is stored in Redis at `compile:log:{projectId}` (1-hour TTL) and as a fallback in a local file at `.somescript/compile-log.json`. The Eve agent reads it back via `apps/editor/agent/tools/read-compile-log.ts`. Logs are capped to the last 100KB (`MAX_STORED_LOG_BYTES`), preserving only the tail where errors live.

### Compile error parsing

`apps/editor/lib/compile-errors.ts` parses Tectonic's structured error format (`error: <file>:<line>: <message>`) with deduplication — the compiler runs twice on a cold cache, so the same error appears twice and is collapsed into one. Used by both the terminal log viewer UI and the agent's `compile-project` tool output.

### Compile throttle

The Eve agent's `compile-project` tool (`apps/editor/agent/tools/compile-project.ts`) applies its own per-process throttle (3-second window) separate from the API rate limiter. The API rate limiter (`apps/editor/lib/rate-limit.ts`) cannot be used from the agent bundle because it top-level-imports Clerk.

## Draft mode

The editor used to pass `draft: true` to the compiler when the user was in fast-compile mode. Draft mode was removed in commit `9357fa7` — `apps/compiler/draft-mode.ts` and `apps/compiler/draft-mode.test.ts` were deleted, and the Tectonic binary was bumped to 0.17.0.

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
- the compiler can also use a **Redis distributed output cache** — when `REDIS_URL` is set, compiled PDFs are cached keyed by SHA-256 project hash for faster repeat compiles across instances (`4eee6f4`)
- the service validates path traversal before reading or writing files
- PDFs are returned base64-encoded in upload mode

## File serving behavior

`apps/editor/app/api/files/route.ts` is the canonical file-serving route for the editor UI.

### GET behavior

- `?path=<file>` on a text file returns JSON with `{ content }`
- PDFs are returned as binary `application/pdf`
- images are returned as binary with the correct image MIME type
- when no file path is supplied, the route returns the project tree and relative project path

## Collaboration service

`apps/collaboration/` is a standalone Bun service running Hocuspocus v4. It provides real-time co-editing via a Y.js CRDT WebSocket connection.

### Architecture

```
Bun.serve → crossws (Bun adapter) → Hocuspocus server
```

Hocuspocus v4 split networking into a separate `Server` wrapper that hardcodes `crossws/adapters/node` (Bun-incompatible). This service drives the Bun-native path instead: the `Hocuspocus` class directly, bridged to `Bun.serve` via crossws's own Bun adapter.

### Room model

Rooms are named `project:<projectId>`. Each project gets one Y.Doc with:

- A `Y.Text` per file, keyed `file:<relative-path>` — the CRDT-backed text buffer
- A hidden `Y.Map` called `__lastWritten` storing content hashes of last-persisted files, preventing cross-replica clobber
- Awareness state for cursors, selections, active file, and version tokens (file tree, tasks, project settings)

### Persistence model

- Text files remain the source of truth for the compiler
- Binary Y.Doc state is stored at `.somescript/collab-state.bin` (excluded from file tree and compile)
- On changes, files are persisted to storage via `spliceText()` — a prefix/suffix splice rather than full replace — preserving unrelated CRDT positions and peer cursors
- Persistence is debounced to batch writes
- `notifyCollabPathsChanged()` (`apps/editor/lib/collab-notify.ts`) is called by agent tools (write-file, edit-file) and `/api/files` so the collaboration server does not revert out-of-band edits on the next autosave debounce

### Version tokens for live refresh

File tree, tasks, and project settings use **awareness version tokens** (not CRDT merge semantics) to signal peer refreshes. Each writer stamps an opaque token on its own awareness after a successful save; other peers diff the composite key and refetch on change. Defined in `apps/editor/lib/file-tree-sync.ts`.

### Cross-service ownership check

The collaboration server reuses `apps/editor/lib/storage.ts` for persistence and performs its own PostgreSQL ownership check (`SELECT workspace_id FROM projects WHERE id = $1`) before allowing a connection, matching the same predicate `apps/editor/lib/authz.ts` enforces on REST API routes.

### Key environment variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL for project ownership verification |
| `REDIS_URL` | Hocuspocus Redis extension (cross-replica awareness sync) |
| `CLERK_SECRET_KEY` | Clerk JWT verification for WebSocket auth |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated CSP authorized parties |
| `COLLAB_INTERNAL_SECRET` | Shared secret for editor→collab WebSocket auth |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 storage permissions |

### Testing

| Test file | What it covers |
|---|---|
| `apps/editor/hooks/use-collaboration.ts` (collocated tests) | Editor-side collaboration hook; remote cursor/selection normalization |
| `apps/editor/lib/collab-binding.test.ts` | Regression: prevents collaboration binding from blanking an open file when Y.Text is empty |
| `apps/collaboration/splice.test.ts` | CRDT-safe text splice logic |
| `apps/editor/lib/file-tree-sync.test.ts` | Version token key computation |