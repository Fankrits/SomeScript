# SomeScript — Modern AI-Powered LaTeX Platform

**SomeScript** is a LaTeX editor with two ways to use it:

- **SomeScript Desktop** — a **free app for macOS, Windows and Linux**. Your projects are plain folders on your computer, LaTeX compiles locally with a bundled [Tectonic](https://tectonic-typesetting.github.io/), and there is no account, no cloud and no subscription. An optional AI assistant works with your own API key.
- **SomeScript Cloud** — the hosted platform: marketing site, sign-in, workspaces and billing, the same editor in the browser, and a compile service. Built as a Bun-managed monorepo.

Both share one editor: CodeMirror with LaTeX highlighting, an embedded PDF preview with SyncTeX, project-wide search and replace, and an AI assistant that can read, edit and compile your project.

---

## 🖥️ SomeScript Desktop

### Install

Pick one. Each command installs the latest release; the `curl` and `irm` installers check its SHA-256 against the release's `SHA256SUMS.txt` first and stop on a mismatch.

```sh
# macOS (Homebrew)
brew tap Fankrits/somescript https://github.com/Fankrits/SomeScript && brew trust Fankrits/somescript && brew install --cask somescript

# macOS or Linux (shell installer)
curl -fsSL https://github.com/Fankrits/SomeScript/releases/latest/download/install.sh | sh

# Windows (PowerShell)
irm https://github.com/Fankrits/SomeScript/releases/latest/download/install.ps1 | iex
```

Homebrew 7 and later ask you to trust a third-party tap (`brew trust`); on an older Homebrew leave that step out.

Prefer a normal installer? Download one from the [latest release](https://github.com/Fankrits/SomeScript/releases/latest):

| Platform | File | Requirements |
| :--- | :--- | :--- |
| **macOS** (Apple Silicon and Intel) | `SomeScript-<version>-macos-universal.dmg` | macOS 12 or later |
| **Windows** (x64) | `SomeScript-<version>-windows-x64-setup.exe` | Windows 10 or 11 |
| **Linux** (x64) | `.AppImage` (updates itself), `.deb`, `.rpm` | glibc 2.39 or newer (Ubuntu 24.04, Debian 13, Fedora 40+) |

> Releases are **not code-signed yet**. Installing with the commands above avoids the macOS Gatekeeper and Windows SmartScreen prompts; a downloaded `.dmg` or `.exe` shows them once (macOS: right-click, then Open; Windows: More info, then Run anyway).

### What you get

- 📁 **Projects are folders.** Choose where they live on first launch; open them in any other tool. Deleted projects wait in the trash for 7 days.
- 📄 **The full editor**: CodeMirror, file tree, multi-file search and replace, a task board, and automatic compile a few seconds after you stop typing.
- 🖼️ **PDF preview with SyncTeX**: click in the PDF to jump to the source and back. **Download PDF** from the dashboard compiles and saves it; **Export as ZIP** and **Import** move whole projects.
- 🌐 **Works offline.** Tectonic fetches LaTeX packages the first time a document needs them; **Prepare for offline use** downloads the common ones up front.
- 🤖 **Bring-your-own-key AI assistant.** Add OpenAI, Anthropic, OpenRouter, Gemini, a local model such as Ollama, or any OpenAI-compatible endpoint in **Settings**. Keys stay on your computer and are never shown again after saving.
- 🔄 **Updates itself.** The app checks for new versions (signed, verified against a public key built into the app) and offers a one-click install. Turn the automatic check off in **Settings → About**.
- 🔒 **Private by design.** The app talks to a server on `127.0.0.1` only. No account, no telemetry, and the only network use is package downloads, update checks and the AI provider you choose.

### Uninstall

- **Homebrew**: `brew uninstall --cask somescript`
- **macOS (installer script or `.dmg`)**: delete `SomeScript.app`
- **Linux**: `rm -rf ~/.local/share/somescript ~/.local/bin/somescript ~/.local/share/applications/somescript.desktop` (`.deb`/`.rpm`: use your package manager)
- **Windows**: Settings → Apps → Installed apps → SomeScript

Your projects are never touched by an uninstall. The full desktop guide (architecture, build from source, testing, release process, troubleshooting) is in [`apps/tauri/README.md`](apps/tauri/README.md).

---

## 🌟 Key Features (shared by both)

- 📄 **Real-Time CodeMirror Editor**: Modern, customizable text editor with LaTeX syntax highlighting (`codemirror-lang-latex`), multi-file workspace search/replace, and dark/light themes.
- ⚡ **Tectonic Engine Compilation**: Instant LaTeX compilation without needing a bulky local TeX Live setup — bundled in the desktop app, a containerized Bun microservice in the cloud.
- 🎯 **SyncTeX Navigation**: Seamless bidirectional jump between LaTeX source code lines and PDF visual coordinates (`synctex view` / `synctex edit`).
- 🤖 **AI Assistant**: Integrated into the editor workspace via `@assistant-ui/react`, offering file operations (read, edit, write), project search, compiling, and Human-in-the-Loop (HITL) confirmation cards. Cloud uses the Eve agent; the desktop app uses your own provider key.
- 🖼️ **PDF Preview**: Embedded PDF viewer built with `@embedpdf/react-pdf-viewer` supporting zooming, panning, text selection, and instant preview auto-refresh on compile.

### Cloud only

- 🔒 **Workspace Authentication & Security**: Clerk-authenticated dashboard with multi-tenant workspace isolation and database-backed project authorization.
- 💳 **Stripe Billing & Quotas**: Tiered subscriptions (Pro/Team) and AI token/credit quota tracking.
- 🐳 **Cloud-Native & Docker Ready**: Pre-configured Docker Compose setup powering PostgreSQL, Redis caching & rate limiting, and RustFS (S3-compatible storage).

---

## 📂 Repository & Monorepo Structure

This monorepo is managed using **Bun** (v1.3.14) and **Turborepo**:

```
.
├── apps/
│   ├── tauri/      # Tauri v2 + Rust - SomeScript Desktop (reuses the editor's UI, re-implements its /api in Rust)
│   ├── web/        # Next.js 16 - Marketing site, Clerk auth, workspace dashboard, Stripe billing
│   ├── editor/     # Next.js 16 - Core LaTeX IDE, CodeMirror editor, PDF preview, Eve AI assistant
│   ├── compiler/   # Bun microservice - Tectonic & SyncTeX LaTeX compilation engine
│   └── docs/       # Nuxt/Docus - Project documentation site
├── Casks/          # Homebrew cask for the desktop app (the tap is this repository)
├── docs/           # CI/CD and release documentation
├── openwiki/       # In-repo developer documentation wiki
├── docker-compose.yml # PostgreSQL, Redis, RustFS (S3), and Compiler service definitions
└── package.json    # Root workspace configuration
```

### Application Surface Breakdown

| Area | Port | Description | Tech Stack |
| :--- | :--- | :--- | :--- |
| **Desktop (`apps/tauri`)** | `:1420` (dev) | Free local app: project library, the editor, bring-your-own-key AI, in-app updates | Tauri v2, Rust (axum), Vite, React, Tectonic |
| **Web (`apps/web`)** | `:3000` | Landing page, workspace dashboard, project management, Stripe checkout & webhooks | Next.js 16, Clerk, Drizzle ORM, Stripe, Tailwind CSS |
| **Compiler (`apps/compiler`)** | `:3001` | Microservice compiling TeX sources to PDF via Tectonic with differential file sync & Redis caching | Bun, Tectonic, SyncTeX CLI, Redis |
| **Editor (`apps/editor`)** | `:3002` | Core LaTeX workspace editor with file tree, PDF viewer, SyncTeX, and Eve AI Chat | Next.js 16, CodeMirror, `@embedpdf`, `@assistant-ui/react` |
| **Docs (`apps/docs`)** | `:3003` | Documentation website | Nuxt, Docus, KaTeX |

The desktop app does not fork the editor: Vite aliases `@/` to `apps/editor`, so both products compile the same source. See [`apps/tauri/README.md`](apps/tauri/README.md) before changing anything in `apps/editor` that calls an `/api` route.

---

## 🛠️ Tech Stack

- **Core & Runtime**: [Bun](https://bun.sh/) (v1.3.14), [Turborepo](https://turbo.build/)
- **Desktop**: [Tauri v2](https://tauri.app/), Rust ([axum](https://github.com/tokio-rs/axum)), Tauri updater
- **Frontend Frameworks**: [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Nuxt](https://nuxt.com/)
- **LaTeX Engine**: [Tectonic](https://tectonic-typesetting.github.io/), [SyncTeX](https://github.com/jlaurens/synctex)
- **Editor & PDF Viewer**: [CodeMirror 6](https://codemirror.net/), [`@embedpdf/react-pdf-viewer`](https://embedpdf.com/)
- **AI Integration**: [`@assistant-ui/react`](https://assistant-ui.com/), Vercel AI SDK, Eve Framework (cloud); provider-agnostic Rust agent loop (desktop)
- **Database & Storage**: PostgreSQL (Drizzle ORM), Redis, RustFS (S3-compatible API)
- **Auth & Billing**: Clerk Auth, Stripe

---

## 🚀 Getting Started (developers)

### Prerequisites

- **Bun**: `v1.3.14` (pinned in `package.json`)
- **Cloud apps**: Docker & Docker Compose for PostgreSQL, Redis, RustFS S3, and the Compiler service
- **Desktop app**: a stable [Rust](https://rustup.rs/) toolchain, plus the [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/) for your OS

```bash
git clone https://github.com/Fankrits/SomeScript.git
cd SomeScript
bun install
```

### Desktop app

```bash
cd apps/tauri
bun run desktop:sidecars   # downloads Tectonic (checksum-verified) and builds SyncTeX
bun run tauri dev          # Vite on :1420, Rust API on :1430, native window
```

No accounts or environment variables are needed. Checks before a pull request:

```bash
cd apps/tauri && bun run typecheck && bun run lint && bun run format:check && bun run web:build && bun test
cd apps/tauri/src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

End-to-end tests, building installers, and the release process are covered in [`apps/tauri/README.md`](apps/tauri/README.md) and [`docs/ci-cd.md`](docs/ci-cd.md).

### Cloud platform

Spin up PostgreSQL, Redis, RustFS (S3), and the Tectonic Compiler container, then start the apps:

```bash
docker compose up -d
bun dev
```

This starts:
- **Web App**: `http://localhost:3000`
- **Editor App**: `http://localhost:3002`

You can also run services independently:

```bash
# Web application (Landing & Dashboard)
cd apps/web && bun dev

# Compiler microservice
cd apps/compiler && bun --watch index.ts

# Editor application
cd apps/editor && bun dev

# Documentation site
cd apps/docs && bun dev
```

---

## 📚 Documentation & OpenWiki

- 🖥️ [Desktop app guide](apps/tauri/README.md) — install, how it works, first-run setup, AI assistant, updates, security model, building and releasing.
- 🚦 [CI/CD](docs/ci-cd.md) — workflows, required checks, release secrets, and how to run every check locally.
- 📖 [OpenWiki Quickstart](openwiki/quickstart.md) — Architectural overview, request flows, storage abstractions, and navigation links.
- 🏗️ [Architecture](openwiki/architecture.md) — System boundaries and database schema.
- ⚙️ [Operations & Compilation Pipeline](openwiki/operations.md) — Compilation pipeline, differential syncing, and S3 file storage.

---

## 📜 License

Private codebase. All rights reserved.
