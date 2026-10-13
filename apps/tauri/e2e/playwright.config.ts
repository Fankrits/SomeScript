// End-to-end tests: the REAL app server (the Rust binary, headless), its embedded UI in a real
// browser, a scripted model provider, and a stand-in for Tectonic (the real one downloads its TeX
// bundle from the network; the Rust tests and CI's "real Tectonic round trip" cover that).
//
//   bun run web:build && (cd src-tauri && cargo build)     build what the binary embeds
//   bun run e2e                                            (Linux needs a display: xvfb-run -a bun run e2e)
//
// E2E_APP=/path/to/release-binary uses that build instead (the release server needs a port and a
// token, which this config supplies), so the same suite can gate a packaged app.
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import { samplePdf } from "./sample-pdf";

const here = dirname(fileURLToPath(import.meta.url));
const exe = process.platform === "win32" ? ".exe" : "";
const release = Boolean(process.env.E2E_APP);
const app =
  process.env.E2E_APP ?? resolve(here, `../src-tauri/target/debug/somescript-desktop${exe}`);
const port = Number(process.env.E2E_PORT ?? 1471);
const token = release ? "e2e-token-0123456789abcdef" : undefined;
const baseURL = `http://127.0.0.1:${port}`;

// Fresh library, config dir and stand-in engine for every run. Workers load this file too, so
// only the main process (no TEST_WORKER_INDEX) creates them.
const run = join(here, ".run");
if (process.env.TEST_WORKER_INDEX === undefined) {
  rmSync(run, { recursive: true, force: true });
  mkdirSync(join(run, "library"), { recursive: true });
  mkdirSync(join(run, "config"), { recursive: true });
  writeFileSync(join(run, "sample.pdf"), samplePdf());
  const engine = join(run, "fake-tectonic");
  writeFileSync(
    engine,
    `#!/bin/sh
# Stand-in for Tectonic: "compiles" by writing a real PDF, or fails like Tectonic does when the
# source contains FAKE_TEX_ERROR.
for a in "$@"; do [ "$p" = "--outdir" ] && out="$a"; p="$a"; tex="$a"; done
if grep -q FAKE_TEX_ERROR "$tex"; then
  echo "error: $(basename "$tex"):3: Undefined control sequence" >&2
  exit 1
fi
stem=$(basename "$tex" .tex)
mkdir -p "$out"
cp "${join(run, "sample.pdf")}" "$out/$stem.pdf"
echo "note: Writing $out/$stem.pdf"
`,
  );
  chmodSync(engine, 0o755);
}

export default defineConfig({
  testDir: here,
  testMatch: "*.e2e.ts",
  outputDir: join(run, "results"),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One app server, one library: tests create their own projects and clean their own providers.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["list"], ["github"], ["html", { open: "never", outputFolder: join(run, "report") }]]
    : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
    // The release server wants its per-launch token as a cookie on every request, API calls and
    // downloads included. A real cookie (what the webview holds after the /?t=<token> redirect), not an
    // extra header: the browser's download manager does not send those.
    storageState: token
      ? {
          cookies: [
            {
              name: "ss_token",
              value: token,
              domain: "127.0.0.1",
              path: "/",
              httpOnly: true,
              secure: false,
              sameSite: "Strict" as const,
              expires: -1,
            },
          ],
          origins: [],
        }
      : undefined,
  },
  webServer: {
    command: `"${app}"`,
    url: `${baseURL}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...(process.env as Record<string, string>),
      SOMESCRIPT_HEADLESS: "1",
      SOMESCRIPT_LIBRARY: join(run, "library"),
      TECTONIC_BIN: join(run, "fake-tectonic"),
      // Keep the app's own config (AI keys!) out of the developer's real profile.
      XDG_CONFIG_HOME: join(run, "config"),
      APPDATA: join(run, "config"),
      ...(process.platform === "darwin" ? { HOME: join(run, "home") } : {}),
      ...(release
        ? { SOMESCRIPT_PORT: String(port), SOMESCRIPT_TOKEN: token! }
        : { SOMESCRIPT_DEV_API_PORT: String(port) }),
    },
  },
});
