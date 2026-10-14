// The same specs in WebKit instead of Chromium. WebKit is the engine under the Mac app's WKWebView (and
// under WebKitGTK, which the Linux build uses), and it is where the editor has misbehaved: the missing
// APIs of an old WebKit (e2e/old-webview.e2e.ts simulates those), and anything that differs in focus,
// events, drag and drop or layout. This is Playwright's own WebKit build at its current version, not the
// system's, so it is the same engine family and not the same macOS release.
//
//   bun x playwright install --with-deps webkit           once
//   bun run web:build && (cd src-tauri && cargo build)
//   xvfb-run -a bun run e2e:webkit e2e/tasks.e2e.ts
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  use: { ...base.use, browserName: "webkit" },
});
