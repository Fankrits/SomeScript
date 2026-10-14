import { v4 } from "uuid";

// `crypto.randomUUID` is missing from WKWebView before Safari 15.4 (macOS 12.0 to 12.2 until Safari is
// updated) and from pages the webview does not treat as a secure context, and the editor ids every
// new task, file and chat message with it. Fill the gap with `uuid`, the canonical RFC 4122 v4
// implementation (github.com/uuidjs/uuid), which uses `crypto.getRandomValues`, available everywhere.

/** Adds `randomUUID` to `target` when the webview lacks it. Returns whether it had to. */
export function installRandomUUID(
  target: Partial<Crypto> | undefined = globalThis.crypto,
): boolean {
  if (!target || typeof target.randomUUID === "function") return false;
  Object.defineProperty(target, "randomUUID", {
    // `v4()` with no arguments calls the global `crypto.randomUUID`, which is this function once
    // installed: the empty options object keeps it on `getRandomValues` instead of recursing.
    value: () => v4({}),
    configurable: true,
    writable: true,
  });
  return true;
}
