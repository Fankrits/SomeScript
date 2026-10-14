# SomeScript Desktop

A free, local LaTeX editor. Projects are plain folders on your computer, compiling uses a bundled
[Tectonic](https://tectonic-typesetting.github.io/), and nothing needs an account or a network connection
(Tectonic downloads LaTeX packages the first time a document needs them; **Prepare for offline use** in the
app fetches the common ones up front).

No authentication and no collaboration. An optional **AI assistant** is built in and bring-your-own-key: add a
provider (OpenAI, Anthropic, OpenRouter, Gemini, a local model such as Ollama, or any OpenAI-compatible custom
endpoint) in **Settings** and the chat panel works on the open project. See _AI assistant_.

## How it works

```
Tauri window ──► http://127.0.0.1:<random port>/?t=<token>        (loopback only)
                      │
   Rust (src-tauri)   ▼
   axum server ── Host check + per-launch token cookie on every request
     ├─ the built SPA, embedded in the binary
     ├─ /api/*   the SAME contract apps/editor's Next routes implement (files, search, compile, ...)
     ├─ /api/projects, /api/trash, /api/templates, /api/settings   (library screen, desktop only)
     └─ /api/ai/*, /api/chat/*   (AI settings, streaming chat, chat history; desktop only)
   storage.rs  traversal- and symlink-safe paths, atomic writes, sha256 versions
   tex.rs      bundled tectonic + synctex as sidecar processes
   ai/         the assistant: provider protocols, tools, agent loop, key store
```

**The UI is not forked.** `vite.config.ts` aliases `@/` to `apps/editor`, so the desktop app compiles the
cloud editor's own source. Next.js, Clerk, Sentry, analytics and the Eve chat are replaced by small shims in
`src/shims/`. The Rust server re-implements the `/api/*` routes the editor calls, so none of its 35 `fetch`
call sites (nor its image/PDF/download URLs) needed changing.

**Old system webviews are covered.** macOS 12.0 is the minimum, and its WebKit can predate `crypto.randomUUID`,
`Array#at`, `Object.hasOwn` (Safari 15.4) and `Array#toSorted` / `#toReversed` (Safari 16), all of which the editor
uses; without them the editor does not even render. `src/shims/polyfills.ts` fills them in
([core-js](https://github.com/zloirock/core-js) and [uuid](https://github.com/uuidjs/uuid)), and
`e2e/old-webview.e2e.ts` strips them from the browser to prove the app still works. If the editor starts using
another recent web API, add it to the polyfills and that spec.

A project is a **folder** in the library (default `~/Documents/SomeScript`); its name is its id. There is no
database. Deleted projects move to `<library>/.trash/` for 7 days.

| Path                           | What                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------ |
| `src/main.tsx`, `src/root.tsx` | Host entry. `/dashboard` is the library, `/?projectId=…` is the editor               |
| `src/library/`                 | Library screen (new project, import/export ZIP, trash, library folder, offline prep) |
| `src/settings/`                | App-wide Settings screen (`/settings`): AI providers and keys, library folder        |
| `src/chat/`                    | The chat panel: streaming UI, tool cards with diffs and Undo, history                |
| `src/shims/`                   | Stand-ins for `next/*`, Clerk, Sentry, analytics, the cloud chat; web-API polyfills  |
| `src-tauri/src/api/`           | Route-by-route ports of `apps/editor/app/api/*`; each file names its source          |
| `src-tauri/src/ai/`            | The assistant (see below). `api/ai.rs` holds its HTTP routes                         |
| `e2e/`                         | End-to-end tests (Playwright) against the real server and UI                         |
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
| `SOMESCRIPT_HEADLESS`                 | Run the server with no window and no Dock icon (smoke tests, CI)                      |

## Test

```sh
bun run typecheck                          # the host, the editor source it aliases, and the e2e tests
cd src-tauri && cargo test                 # unit + HTTP contract tests (no TeX, no network, no API key)
TECTONIC_BIN=… SYNCTEX_BIN=… cargo test -- --ignored real_    # real Tectonic/SyncTeX round trip
bun run web:build && bun test              # drift guard (below) + the chat's unit tests

# End to end: the real server and its embedded UI in a browser, a scripted model provider, and a
# stand-in for Tectonic. Build what the binary embeds first; Linux needs a display (xvfb-run -a).
bun run web:build && (cd src-tauri && cargo build)
bun run e2e:install                        # once: the Chromium Playwright drives
bun run e2e                                # E2E_APP=<release binary> runs the same suite against it
```

The end-to-end suite covers the Settings screen (adding, testing, editing and removing providers; the key
never coming back), the whole chat (streaming, every tool, Undo, errors, Stop, history, both protocols),
auto-compile, and the Tasks board. `e2e/mock-provider.ts` is the scripted provider: its header lists what each
kind of prompt makes it do.

**Editor drift.** Because the desktop app compiles the editor, a future editor change can add an `/api` call
the Rust server lacks. `scripts/api-coverage.test.ts` checks the built bundle against the Rust routes and
fails with the path and chunk. Fix it by implementing the route in `src-tauri/src/api/`, or by stubbing the
editor module in `src/shims/` (mirror the alias in **both** `vite.config.ts` and `tsconfig.json`).

## Release

```sh
bun run desktop:sidecars && bun run desktop:build      # .app + .dmg under src-tauri/target/release/bundle
# macOS, one file for Apple Silicon and Intel (this is what CI ships); needs both Rust targets
# (`rustup target add aarch64-apple-darwin x86_64-apple-darwin`). Output: target/universal-apple-darwin/release/bundle
bun run desktop:sidecars:universal && bun run desktop:build:universal
```

`desktop:build` merges `src-tauri/tauri.bundle.conf.json` (sidecars + templates); on Linux use `desktop:build:linux`,
whose sidecars live in the app's lib dir because `/usr/bin/synctex` would collide with TeX Live's package. The bundle
configs are separate from `tauri.conf.json` so `cargo test` and `tauri dev` don't need the binaries. CI builds one universal
installer for macOS (Apple Silicon + Intel via `tauri build --target universal-apple-darwin`, verified on both Apple Silicon and Intel runners),
and x64 installers for Windows and Linux; `scripts/fetch-sidecars.sh` pins a SHA-256 per platform for the official Tectonic
build (Linux needs the glibc build, not musl, which breaks Thai/CJK line breaking, and it needs glibc 2.39+).
Builds are **unsigned** until signing secrets are configured: macOS shows a Gatekeeper warning, Windows a SmartScreen
warning. Windows/Linux on ARM are not built.

Before anything is published, CI checks the bundle itself (see `docs/ci-cd.md`):

```sh
bun run desktop:verify                                  # sidecars beside the executable, expected libraries only, templates, licenses
sh scripts/smoke-bundle.sh <SomeScript.app | somescript-desktop[.exe]> --compile   # starts it headless in a clean env and drives the HTTP surface
```

`verify-bundle.sh` and `smoke-bundle.sh` take a macOS `.app`, a Linux tree from `dpkg-deb -x`, or a Windows install
directory (run them from Git Bash there). On Linux the smoke test starts Xvfb if there is no display.

A release is a tag: `desktop-vX.Y.Z` on a commit that is on `main` (`scripts/check-version.mjs` requires the tag,
`Cargo.toml`, `tauri.conf.json` and `package.json` to agree). The _Desktop release_ workflow builds, verifies and
smoke-tests every platform, then creates a **draft** GitHub release with the installers and one `SHA256SUMS.txt`.

Licenses of everything bundled are in `src-tauri/THIRD_PARTY_LICENSES.md`.

## Security model

The webview loads from a localhost server, so that server is the trust boundary: it binds `127.0.0.1` only,
rejects any `Host` other than its own (DNS rebinding), and requires a random per-launch token, exchanged on
first load for an `HttpOnly; SameSite=Strict` cookie. Every file path is confined to its project (including
through symlinks). ZIP imports are size-capped by bytes actually read, not by declared size.

## AI assistant

The chat panel in the editor's sidebar is the assistant. Open **Settings** from the dashboard (or the chat's
"Set up AI" prompt) to connect it.

**Providers.** A provider is a base URL, an optional key and a protocol: _OpenAI-compatible_ (chat completions:
OpenAI, OpenRouter, Groq, DeepSeek, Gemini's compatibility endpoint, Ollama, LM Studio, vLLM, LiteLLM, Azure OpenAI,
and any **custom endpoint** that speaks it) or _Anthropic_ (messages). Settings can fetch a provider's model list,
test the connection, and send a real test message before saving. Local servers need no key. A key can be sent in a
different header (Azure's `api-key`) under _Advanced_. Providers, the active model and your custom instructions are
global: they apply to every project.

**How it runs.** The webview never talks to a model. It posts the conversation to `/api/ai/chat` and the Rust server
calls the provider (`ai/protocol.rs` builds the request and decodes the stream for either protocol), runs the tools
the model asks for against the project folder, feeds the results back, and streams everything to the UI as NDJSON
(`ai/agent.rs` documents the events). Stop closes the request and kills a running compile.

**Tools** (`ai/tools.rs`; ports of the cloud assistant's, same names and wording): `list_files`, `read_file`, `grep`,
`edit_file` (exact-once replacement, tolerant of CRLF files), `write_file` (refuses if the file changed since the
model read it), `delete_file`, `move_file`, `compile_project`, and `todo_write` (the live plan). Every path goes through
`Project::resolve`, so a model can't leave the project, and the app's own folders (`.somescript`, `.git`,
`.preview-cache`, ...) are off limits. Edits show a diff with **Undo**, which asks first if the file changed since.
A model that can't use tools (many small local ones) still chats.

**Local models.** Ollama and LM Studio often load a model with a 2–4k-token context window and silently cut
anything longer from the front, which is where the tool definitions are. The model then calls tools with no
arguments (or prints the call as text). The fixed part of every request, the instructions plus the nine tool
definitions, is about 3k tokens (a Rust test keeps it from growing), and the files the model reads come on top, so
give the model 16k or more: `OLLAMA_CONTEXT_LENGTH=16384 ollama serve` for Ollama, the _Context Length_ setting
when you load the model in LM Studio. If the same failing call repeats three times the assistant stops and, for a
model on this computer, tells you to check the context window.

**Keys and privacy.**

- Keys are stored in `ai.json` in the OS app-config dir, written owner-only on Unix, and are never returned: the UI
  only sees `hasKey` and the last four characters, errors have the key redacted, and nothing is logged. (A keychain
  would be stronger at rest but needs a running secret service on Linux and fails silently in headless sessions.)
- The text of the files the assistant reads, and what you type, goes to the provider you chose, and nowhere else.
- Redirects are not followed (a custom header like `x-api-key` would travel with them), loopback endpoints bypass
  system proxies, and everything else honours them. TLS is rustls with the OS root store (no OpenSSL to bundle).

**History** lives in the project (`.somescript/chat/`), so it follows the folder and never mixes projects; it is not
part of exports. The editor's own history menu (New Chat, History, delete) drives it through `src/shims/eve-threads-client.ts`.

**Extending.** A new protocol belongs in `ai/protocol.rs` (request body, auth, stream decoder; the agent above it is
protocol-agnostic). A new tool needs a schema and an arm in `ai/tools.rs`, a card in `src/chat/tool-cards.tsx`, and a
line in `ai/instructions.md` (a test fails if the prompt and the tools drift apart).
