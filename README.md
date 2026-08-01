# SomeScript — Modern AI-Powered LaTeX Platform

**SomeScript** is an advanced, AI-native LaTeX editing platform built as a Bun-managed monorepo. It features a modern web marketing & dashboard interface, a real-time CodeMirror LaTeX editor with embedded PDF preview and SyncTeX navigation, a high-performance Rust/Bun/Tectonic LaTeX compilation engine, an embedded AI assistant (Eve), and comprehensive documentation.

---

## 🌟 Key Features

- 📄 **Real-Time CodeMirror Editor**: Modern, customizable text editor with LaTeX syntax highlighting (`codemirror-lang-latex`), multi-file workspace search/replace, and dark/light themes.
- ⚡ **Tectonic Engine Compilation**: Instant LaTeX compilation without needing a bulky local TeX Live setup, powered by a containerized Bun microservice running the Tectonic engine.
- 🎯 **SyncTeX Navigation**: Seamless bidirectional jump between LaTeX source code lines and PDF visual coordinates (`synctex view` / `synctex edit`).
- 🤖 **Embedded Eve AI Assistant**: AI assistant integrated into the editor workspace via `@assistant-ui/react`, offering file operations (read, edit, write), citation searches, web browsing, and Human-in-the-Loop (HITL) confirmation cards.
- 🖼️ **PDF Preview**: Embedded PDF viewer built with `@embedpdf/react-pdf-viewer` supporting zooming, panning, text selection, and instant preview auto-refresh on compile.
- 🔒 **Workspace Authentication & Security**: Clerk-authenticated dashboard with multi-tenant workspace isolation and database-backed project authorization.
- 💳 **Stripe Billing & Quotas**: Tiered subscriptions (Pro/Team) and AI token/credit quota tracking.
- 🐳 **Cloud-Native & Docker Ready**: Pre-configured Docker Compose setup powering PostgreSQL, Redis caching & rate limiting, and RustFS (S3-compatible storage).

---

## 📂 Repository & Monorepo Structure

This monorepo is managed using **Bun** (v1.3.14) and **Turborepo**:

```
.
├── apps/
│   ├── web/        # Next.js 16 - Marketing site, Clerk auth, workspace dashboard, Stripe billing
│   ├── editor/     # Next.js 16 - Core LaTeX IDE, CodeMirror editor, PDF preview, Eve AI assistant
│   ├── compiler/   # Bun microservice - Tectonic & SyncTeX LaTeX compilation engine
│   └── docs/       # Nuxt/Docus - Project documentation site
├── openwiki/       # In-repo developer documentation wiki
├── docker-compose.yml # PostgreSQL, Redis, RustFS (S3), and Compiler service definitions
└── package.json    # Root workspace configuration
```

### Application Surface Breakdown

| Area | Port | Description | Tech Stack |
| :--- | :--- | :--- | :--- |
| **Web (`apps/web`)** | `:3000` | Landing page, workspace dashboard, project management, Stripe checkout & webhooks | Next.js 16, Clerk, Drizzle ORM, Stripe, Tailwind CSS |
| **Compiler (`apps/compiler`)** | `:3001` | Microservice compiling TeX sources to PDF via Tectonic with differential file sync & Redis caching | Bun, Tectonic, SyncTeX CLI, Redis |
| **Editor (`apps/editor`)** | `:3002` | Core LaTeX workspace editor with file tree, PDF viewer, SyncTeX, and Eve AI Chat | Next.js 16, CodeMirror, `@embedpdf`, `@assistant-ui/react` |
| **Docs (`apps/docs`)** | `:3003` | Documentation website | Nuxt, Docus, KaTeX |

---

## 🛠️ Tech Stack

- **Core & Runtime**: [Bun](https://bun.sh/) (v1.3.14), [Turborepo](https://turbo.build/)
- **Frontend Frameworks**: [Next.js 16](https://nextjs.org/) (App Router), [React 19](https://react.dev/), [Nuxt](https://nuxt.com/)
- **LaTeX Engine**: [Tectonic](https://tectonic-typesetting.github.io/), [SyncTeX](https://github.com/jlaurens/synctex)
- **Editor & PDF Viewer**: [CodeMirror 6](https://codemirror.net/), [`@embedpdf/react-pdf-viewer`](https://embedpdf.com/)
- **AI Integration**: [`@assistant-ui/react`](https://assistant-ui.com/), Vercel AI SDK, Eve Framework
- **Database & Storage**: PostgreSQL (Drizzle ORM), Redis, RustFS (S3-compatible API)
- **Auth & Billing**: Clerk Auth, Stripe

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed on your machine:

- **Bun**: `v1.3.14` (pinned in `package.json`)
- **Docker & Docker Compose**: Required for PostgreSQL, Redis, RustFS S3, and Compiler service
- **Tectonic** *(Optional)*: Needed only if running the compiler directly on host OS without Docker

### 1. Installation

Clone the repository and install dependencies:

```bash
git clone <repository-url>
cd SomeScript-adv
bun install
```

### 2. Start Background Infrastructure Services

Spin up PostgreSQL, Redis, RustFS (S3), and the Tectonic Compiler container using Docker Compose:

```bash
docker compose up -d
```

### 3. Run Development Servers

Launch all applications concurrently using Turborepo:

```bash
bun dev
```

This starts:
- **Web App**: `http://localhost:3000`
- **Editor App**: `http://localhost:3002`

---

## 💻 Running Apps Individually

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

Detailed architectural notes, workflows, API specifications, and guidelines are available in the in-repo **OpenWiki**:

- 📖 [OpenWiki Quickstart](openwiki/quickstart.md) — Architectural overview, request flows, storage abstractions, and navigation links.
- 🏗️ [Architecture](openwiki/architecture.md) — System boundaries and database schema.
- ⚙️ [Operations & Compilation Pipeline](openwiki/operations.md) — Compilation pipeline, differential syncing, and S3 file storage.

---

## 📜 License

Private codebase. All rights reserved.
