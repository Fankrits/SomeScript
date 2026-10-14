// The same specs, in the flow `bun run tauri dev` gives a developer: the editor served unbundled by the
// Vite dev server (port 1420, the app's own React/dev build, Vite's dependency pre-bundling) with /api
// proxied to the Rust debug server, instead of the bundle the Rust binary embeds.
//
// Two dev-server-only failures got past every other check: a package that was missing from the dev
// server's module graph ("Failed to resolve import core-js/..."), and a stale dependency cache that
// had the dev server re-optimize in the middle of loading the editor, which loaded CodeMirror twice
// and rendered a blank editor. Neither shows up in a built bundle.
//
//   bun run web:build && (cd src-tauri && cargo build)
//   xvfb-run -a bunx playwright test --config e2e/playwright.dev.config.ts e2e/tasks.e2e.ts
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type PlaywrightTestConfig } from "@playwright/test";
import base from "./playwright.config";

const here = dirname(fileURLToPath(import.meta.url));
const apiPort = Number(process.env.E2E_PORT ?? 1471);
const viteUrl = "http://localhost:1420";
const appServer = base.webServer as NonNullable<PlaywrightTestConfig["webServer"]> & object;

export default defineConfig({
  ...base,
  // The first load of the editor compiles hundreds of modules on demand.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { ...base.use, baseURL: viteUrl },
  webServer: [
    // The Rust server on its debug port, exactly as the ordinary suite starts it.
    appServer as any,
    {
      command: "bun run web:dev",
      cwd: join(here, ".."),
      url: viteUrl,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...(process.env as Record<string, string>), SOMESCRIPT_DEV_API_PORT: String(apiPort) },
    },
  ],
});
