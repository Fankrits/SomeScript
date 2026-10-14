// The packaged Windows app in its real webview (WebView2), driven over the Chrome DevTools Protocol.
//
// Everything else in e2e/ drives the Rust server's UI in Chromium. That can't show what only the real
// webview does: loading the app from the loopback server with the per-launch cookie, Tauri's IPC being
// available to that origin (the folder picker needs it), or the OS's own Documents folder on a first launch.
// CI (desktop.yml, "Windows (WebView2, first launch)") installs the NSIS build, starts it with
// WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222, and runs this.
//
//   bun run e2e:webview2        (needs APP_URL, and CDP_URL if it isn't http://127.0.0.1:9222)
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "*.cdp.ts", // not *.spec.ts / *.e2e.ts: bun test and the main Playwright config would pick those up
  timeout: 180_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "../.run/webview2-results",
});
