# CI/CD

How code gets checked, released and deployed. Everything here lives in `.github/`.

## The picture

```
 pull request ─► CI ─────────┐
              ─► Desktop ────┼─► required checks: "CI success" · "Desktop success" · "Security success"
              ─► Security ───┘                    │
                                                  ▼
 push to main ─► (same checks) ─► Vercel deploys web / editor / docs to production   (its own Git integration)
 push to a branch ───────────────► Vercel Preview deployments; Railway deploys the compiler (see below)
                                                  │
 any production deploy result ─► Deploy verify ───┴─► issue on failure, smoke check on success, issue closes on recovery

 tag desktop-vX.Y.Z ─► Desktop release ─► verify tag ─► build ─► verify bundle ─► smoke test ─► DRAFT GitHub release
```

Vercel and Railway deploy through their own GitHub integrations. These workflows do **not** deploy anything: they
gate what is merged, watch what the platforms report, and ship the desktop app.

## Workflows

| File                  | Runs on                                                    | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`              | PR, push to `main`                                         | Lint, format, type-check, unit tests, **production builds** (web, editor, docs, collaboration), **Docker image builds** (compiler is started and health-checked), workflow lint. Path-filtered, so a docs-only change skips the builds. Aggregates into **CI success**.                                                                                                                                                                                                                                                           |
| `desktop.yml`         | PR / push touching `apps/tauri`, `apps/editor`, `bun.lock` | Frontend + drift guard on Linux (also on editor changes, because the desktop app compiles the editor); rustfmt, clippy, tests and a real Tectonic round trip on **macOS, Linux and Windows**; and the bundle matrix below. Aggregates into **Desktop success**.                                                                                                                                                                                                                                                                   |
| `desktop-bundle.yml`  | called by the two above                                    | Builds the installers on **macOS (Apple Silicon and Intel), Windows and Linux**, **verifies** each (sidecars beside the executable, expected libraries only, templates, licenses) and **smoke-tests** it headless in a clean environment: the Windows build is installed with its own installer first, the Linux `.deb` is installed in a bare `ubuntu:24.04` container (so a missing dependency declaration fails here). With `release: true`: signs/notarizes the macOS apps if possible and also compiles a document for real. |
| `desktop-release.yml` | tag `desktop-v*`, manual                                   | Checks the tag matches the versions and is on `main`, builds and tests every platform, attests build provenance, creates a **draft** GitHub release with all installers and one `SHA256SUMS.txt`. Manual runs build but publish nothing.                                                                                                                                                                                                                                                                                          |
| `security.yml`        | PR, push to `main`, **weekly**                             | CodeQL (JS/TS and the workflows themselves), dependency review on PRs, JS audit gate, `cargo-deny`, gitleaks over the full history, zizmor. Aggregates into **Security success**.                                                                                                                                                                                                                                                                                                                                                 |
| `deploy-verify.yml`   | every GitHub deployment status                             | For production environments only: opens an issue when a deploy fails, smoke-checks the live site after a success, closes the issue on recovery.                                                                                                                                                                                                                                                                                                                                                                                   |
| `openwiki-update.yml` | nightly                                                    | Pre-existing. Pinned to commit SHAs now.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `dependabot.yml`      | weekly                                                     | Grouped updates for Actions, bun, cargo and Docker; 7-day cooldown; majors and hand-aligned packages (React, CodeMirror, shiki) are left to people.                                                                                                                                                                                                                                                                                                                                                                               |

## Turn these on (one-time, in GitHub / the platforms)

These are settings, not files, so they can't be committed:

1. **Branch protection (or a ruleset) on `main`.** There is none today, so nothing above blocks a merge. Require the
   status checks **CI success**, **Desktop success** and **Security success**, and require PRs. Each check is a single
   aggregate job, so path-filtered jobs that are skipped don't block.
2. **Make the platforms wait for CI.** Today they deploy on push regardless of CI: Railway has a per-service _Wait
   for CI_ option; Vercel can wait for GitHub checks in the project's Git settings (check the current setting name).
3. **Repository variables** `PRODUCTION_URL_WEB`, `PRODUCTION_URL_EDITOR`, `PRODUCTION_URL_DOCS` (for example
   `https://app.example.com`, no trailing slash). Without them _Deploy verify_ still reports failed deploys but only
   notes successes instead of smoke-checking them.
4. **Apple signing secrets**, to sign and notarize the desktop app (it is unsigned until they exist): `APPLE_CERTIFICATE`
   (base64 of the Developer ID Application `.p12`), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
   `APPLE_ID`, `APPLE_PASSWORD` (app-specific password), `APPLE_TEAM_ID`.

## What the platforms do today

Read from the repo's GitHub deployments, not assumed:

- **Vercel** has three projects (`web`, `editor`, `docs`). `main` goes to _Production_; every other push goes to _Preview_.
- **Railway** runs the compiler as `somescript-compiler / production`, and it currently deploys from **`agent-improve`**,
  not `main`: a push to that branch is a production deploy of the compiler.
- Production **docs** has failed on every deploy since at least 2026-08-09, and the latest production **editor** deploy
  (2026-09-06) failed. That is what _Deploy verify_ exists to surface.

## Cutting a desktop release

1. Set the same version in `apps/tauri/src-tauri/Cargo.toml`, `apps/tauri/src-tauri/tauri.conf.json` and
   `apps/tauri/package.json`. (`bun apps/tauri/scripts/check-version.mjs desktop-v1.2.3` checks them.)
2. Merge to `main`. The release workflow refuses a tag whose commit is not on `main`.
3. `git tag desktop-v1.2.3 && git push origin desktop-v1.2.3` (a `-rc.1` style suffix makes it a pre-release).
4. Wait for **Desktop release**. It builds every platform, verifies each bundle, starts it headless and compiles a
   document with the bundled Tectonic, then creates a **draft** release with the installers (see below) and
   `SHA256SUMS.txt`.
5. Review the draft, then publish it.

Verify a download with `sha256sum -c SHA256SUMS.txt` (macOS: `shasum -a 256 -c`), or `gh attestation verify <file> --repo <owner>/<repo>`.

## Desktop platforms

| Platform             | Runner           | Tectonic build             | Installers                  |
| -------------------- | ---------------- | -------------------------- | --------------------------- |
| macOS, Apple Silicon | `macos-latest`   | `aarch64-apple-darwin`     | `.dmg`, zipped `.app`       |
| macOS, Intel         | `macos-15-intel` | `x86_64-apple-darwin`      | `.dmg`, zipped `.app`       |
| Windows 10/11, x64   | `windows-latest` | `x86_64-pc-windows-msvc`   | NSIS `-setup.exe`           |
| Linux, x64           | `ubuntu-24.04`   | `x86_64-unknown-linux-gnu` | `.deb`, `.rpm`, `.AppImage` |

- Every Tectonic download is pinned to a SHA-256 in `apps/tauri/scripts/fetch-sidecars.sh`; SyncTeX is built from source
  on the runner (on Windows with a checksum-pinned zlib compiled in, linked statically).
- **Linux needs glibc 2.39 or newer** (Ubuntu 24.04, Debian 13, Fedora 40): that is what the official glibc Tectonic build
  requires, and the musl build is not an option because it breaks Thai and CJK line breaking. The `.deb` declares it.
- **Windows and Linux are not signed**, and Windows will show a SmartScreen warning until a code-signing certificate is
  added. macOS is unsigned until the Apple secrets exist.
- Not built: Windows on ARM and Linux on ARM (Tectonic publishes no matching official build).

## Run the same checks locally

```sh
bun run lint && bun run format:check                      # every workspace
(cd apps/editor && bun x tsc --noEmit); (cd apps/web && bun x tsc --noEmit)
(cd apps/web && bun test); (cd apps/editor && bun test); (cd apps/compiler && bun test); (cd apps/collaboration && bun test)
bun test ./.github/scripts/audit-gate.test.ts             # Bun skips dot-directories, so name the file
bun .github/scripts/audit-gate.mjs                        # new dependency advisories vs the baseline

cd apps/tauri && bun run typecheck && bun run web:build && bun test
cd apps/tauri/src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
cd apps/tauri/src-tauri && cargo deny check               # needs cargo-deny; config is deny.toml

cd apps/tauri && bun run desktop:sidecars && bun run desktop:build --bundles app
bun run desktop:verify && sh scripts/smoke-bundle.sh src-tauri/target/release/bundle/macos/SomeScript.app --compile
```

The production builds need env vars that CI fills with placeholders; see the `build` job in `ci.yml` for the list.

## Maintaining the pipeline

- **Action versions** are pinned to commit SHAs (a moved tag is a known attack path); Dependabot bumps them. When
  editing by hand, resolve the SHA from the tag and keep the `# vX.Y.Z` comment.
- **Downloaded tools** (actionlint, gitleaks, cargo-deny) are pinned to a version _and_ a SHA-256 taken from the
  release's own checksum file. Bump them together.
- **Bun's version** lives in one place, `.github/actions/setup-js/action.yml`; keep it equal to `packageManager` in
  the root `package.json`.
- **Dependency advisories.** `bun audit` already reports a backlog, so the gate fails only on advisories that are
  _new_ since `.github/audit-baseline.json`, and lists fixed ones. After fixing some, run
  `bun .github/scripts/audit-gate.mjs --update` and commit the smaller baseline. The Rust side uses `cargo-deny`
  with `apps/tauri/src-tauri/deny.toml` (permissive licenses only; all four shipped targets).
- **Workflow security.** zizmor gates at medium severity; its only configured exception is documented in
  `.github/zizmor.yml`. A secret-shaped literal anywhere in the history fails the gitleaks job, which is why the Clerk
  placeholder in `ci.yml` is derived at runtime rather than written out.

## Not covered yet

- Windows code signing and Windows/Linux on ARM (see above).
- Auto-update for the desktop app (needs signing keys and an update feed).
- Browser end-to-end tests of the web and editor apps.
- Publishing the compiler and collaboration images (Railway builds them from the Dockerfiles itself); `ci.yml` only
  proves they build, and that the compiler starts.
- The compiler Dockerfile downloads Tectonic without verifying a checksum; pin one there too.
