// Drift guard. The desktop app compiles apps/editor's UI source, which talks to `/api/*`.
// If the editor starts calling a path the Rust server (src-tauri/src/api) doesn't implement,
// the feature silently breaks on desktop. This checks the built client bundle, which is the
// ground truth of what actually ships (stubbed Eve/Clerk code is already out of it), against
// the routes the Rust server registers.
//
//   bun run web:build && bun test        (CI runs it in this order)
//
// On failure, either implement the route in src-tauri/src/api, or stub the editor module that
// calls it in src/shims (and mirror the alias in vite.config.ts and tsconfig.json).
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const dist = join(root, "dist/assets");

function rustRoutes(): Set<string> {
  const sources = ["src-tauri/src/api/mod.rs", "src-tauri/src/server.rs"];
  const routes = new Set<string>();
  for (const file of sources) {
    for (const [, path] of readFileSync(join(root, file), "utf8").matchAll(
      /"(\/api\/[a-z0-9/_-]+)"/gi,
    )) {
      routes.add(path);
    }
  }
  return routes;
}

/** `/api/...` string literals in the shipped JS, with any query string cut off. */
function bundleApiPaths(): Map<string, string> {
  const found = new Map<string, string>(); // path -> first chunk it appears in
  for (const file of readdirSync(dist).filter((f) => f.endsWith(".js"))) {
    const js = readFileSync(join(dist, file), "utf8");
    for (const [, path] of js.matchAll(/["'`](\/api\/[a-zA-Z0-9/_-]+)/g)) {
      if (!found.has(path)) found.set(path, file);
    }
  }
  return found;
}

describe("desktop API coverage", () => {
  test("the frontend bundle exists (run `bun run web:build` first)", () => {
    expect(existsSync(dist)).toBe(true);
  });

  test("every /api path the shipped UI calls is implemented by the Rust server", () => {
    const routes = rustRoutes();
    expect(routes.size).toBeGreaterThan(10); // the parser found the route table
    const called = bundleApiPaths();
    expect(called.size).toBeGreaterThan(5); // and the bundle scan found the calls

    const missing = [...called]
      .filter(([path]) => !routes.has(path))
      .map(([path, chunk]) => `${path} (in ${chunk})`);
    expect(missing).toEqual([]);
  });

  test("no cloud-only code leaked into the bundle", () => {
    // Stubs in src/shims must keep these out; a hit means an editor import slipped past an alias.
    const js = readdirSync(dist)
      .filter((f) => f.endsWith(".js"))
      .map((f) => readFileSync(join(dist, f), "utf8"))
      .join("\n");
    for (const marker of [
      "clerk.com",
      "sentry.io",
      "clarity.ms",
      "posthog",
      "/api/eve/",
      "ai-gateway",
    ]) {
      expect(js.includes(marker), `bundle mentions ${marker}`).toBe(false);
    }
  });
});
