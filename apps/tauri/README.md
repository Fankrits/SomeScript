# SomeScript Desktop

A free, local LaTeX editor. Projects are plain folders on your computer, compiling uses a bundled
[Tectonic](https://tectonic-typesetting.github.io/), and nothing needs an account or a network connection
(Tectonic downloads LaTeX packages the first time a document needs them; **Prepare for offline use** in the
app fetches the common ones up front).

No authentication, collaboration or AI in v1. AI returns later as bring-your-own-key (see _Extending_).

## How it works

```
Tauri window ──► http://127.0.0.1:<random port>/?t=<token>        (loopback only)
                      │
   Rust (src-tauri)   ▼
   axum server ── Host check + per-launch token cookie on every request
     ├─ the built SPA, embedded in the binary
     ├─ /api/*   the SAME contract apps/editor's Next routes implement (files, search, compile, ...)
     └─ /api/projects, /api/trash, /api/templates, /api/settings   (library screen, desktop only)
   storage.rs  traversal- and symlink-safe paths, atomic writes, sha256 versions
   tex.rs      bundled tectonic + synctex as sidecar processes
```

**The UI is not forked.** `vite.config.ts` aliases `@/` to `apps/editor`, so the desktop app compiles the
cloud editor's own source. Next.js, Clerk, Sentry, analytics and the Eve chat are replaced by small shims in
`src/shims/`. The Rust server re-implements the `/api/*` routes the editor calls, so none of its 35 `fetch`
call sites (nor its image/PDF/download URLs) needed changing.

A project is a **folder** in the library (default `~/Documents/SomeScript`); its name is its id. There is no
database. Deleted projects move to `<library>/.trash/` for 7 days.

| Path                           | What                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `src/main.tsx`, `src/root.tsx` | Host entry. `/dashboard` is the library, `/?projectId=…` is the editor               |
| `src/library/`                 | Library screen (new project, import/export ZIP, trash, library folder, offline prep) |
| `src/shims/`                   | Stand-ins for `next/*`, Clerk, Sentry, analytics, Eve                                |
| `src-tauri/src/api/`           | Route-by-route ports of `apps/editor/app/api/*`; each file names its source          |
| `src-tauri/templates/`         | Bundled project templates (Starter with Thai fonts, Blank)                           |
| `scripts/`                     | `fetch-sidecars.sh`, `sync-public.mjs`, `api-coverage.test.ts`                       |

## Develop

Prerequisites: Rust (stable), Bun, and a LaTeX engine for the sidecars:

```sh
bun install
bun run desktop:sidecars        # downloads Tectonic (checksum-verified) + builds SyncTeX, into src-tauri/binaries/
bun run tauri dev               # Vite on :1420, Rust API on :1430, native window
```

In dev, `/api` is proxied by Vite to the Rust server, so the UI also works in a normal browser at
`http://localhost:1420` (handy for automated checks: there is no auth wall).

| Env var                               | Effect                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `SOMESCRIPT_LIBRARY`                  | Project folder (beats the saved setting)                                              |
| `TECTONIC_BIN`, `SYNCTEX_BIN`         | Use these binaries instead of the bundled / `PATH` ones                               |
| `SOMESCRIPT_DEV_API_PORT`             | Rust API port in debug builds (default 1430; keep in sync with `vite.config.ts`)      |
| `SOMESCRIPT_PORT`, `SOMESCRIPT_TOKEN` | Pin the release server's port and token (≥16 chars), so a test can open the app's URL |

## Test

```sh
bun run typecheck                          # the host AND the editor source it aliases
cd src-tauri && cargo test                 # unit + HTTP contract tests (no TeX needed)
TECTONIC_BIN=… SYNCTEX_BIN=… cargo test -- --ignored real_    # real Tectonic/SyncTeX round trip
bun run web:build && bun test              # drift guard (below)
```

**Editor drift.** Because the desktop app compiles the editor, a future editor change can add an `/api` call
the Rust server lacks. `scripts/api-coverage.test.ts` checks the built bundle against the Rust routes and
fails with the path and chunk. Fix it by implementing the route in `src-tauri/src/api/`, or by stubbing the
editor module in `src/shims/` (mirror the alias in **both** `vite.config.ts` and `tsconfig.json`).

## Release

```sh
bun run desktop:sidecars && bun run desktop:build      # .app + .dmg under src-tauri/target/release/bundle
```

`desktop:build` merges `src-tauri/tauri.bundle.conf.json` (sidecars + templates). It is separate from
`tauri.conf.json` so `cargo test` and `tauri dev` don't need the binaries. Builds are **unsigned** until
Apple Developer ID secrets are configured (see `.github/workflows/desktop.yml`); macOS shows a Gatekeeper
warning for unsigned apps. Only macOS Apple Silicon has a verified Tectonic checksum so far; add other
platforms in `scripts/fetch-sidecars.sh` (Linux needs the glibc build: musl breaks Thai/CJK line breaking).

Licenses of everything bundled are in `src-tauri/THIRD_PARTY_LICENSES.md`.

## Security model

The webview loads from a localhost server, so that server is the trust boundary: it binds `127.0.0.1` only,
rejects any `Host` other than its own (DNS rebinding), and requires a random per-launch token, exchanged on
first load for an `HttpOnly; SameSite=Strict` cookie. Every file path is confined to its project (including
through symlinks). ZIP imports are size-capped by bytes actually read, not by declared size.

## Extending: bring-your-own-key AI

`src/shims/eve-thread.tsx` is where the chat panel plugs in: replace it with a local assistant-ui thread,
keep the key in the OS keychain and call the model from Rust (a streaming `/api/ai/*` route) so it never
reaches the webview. Tool-call cards in `apps/editor/components/assistant-ui/eve-tool-calls.tsx` can be
reused if tool names and output shapes are kept.
