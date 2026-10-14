// Which app build the end-to-end tests drive, shared by playwright.config.ts (the one app server all
// ordinary specs use) and first-run.ts (isolated instances for setup/onboarding specs).
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export const exe = process.platform === "win32" ? ".exe" : "";
/** E2E_APP=/path/to/release-binary runs the suite against a packaged build instead of the debug one. */
export const release = Boolean(process.env.E2E_APP);
export const appPath =
  process.env.E2E_APP ?? resolve(here, `../src-tauri/target/debug/somescript-desktop${exe}`);
/** The release server wants this per-launch token as a cookie on every request. */
export const token = "e2e-token-0123456789abcdef";
