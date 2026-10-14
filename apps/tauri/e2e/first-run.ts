// A whole app instance of its own for one test: its own port, home folder, Documents folder, config and
// log directories. The setup (first run) specs need that: what they check is what happens when nothing
// has been configured yet, which the shared server (started with SOMESCRIPT_LIBRARY, so "already set up")
// can't show, and a test that changes the config must not leak into the next one.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, type Page } from "@playwright/test";
import { appPath, release, token } from "./target";

const IDENTIFIER = "com.fankrits.somescript"; // tauri.conf.json
const here = dirname(fileURLToPath(import.meta.url));

export interface Paths {
  /** Everything the instance owns; deleted when the test ends. */
  root: string;
  /** The stand-in for the user's home folder. */
  home: string;
  /** The stand-in for the system Documents folder. */
  documents: string;
}

export interface Launch {
  /**
   * What the system's Documents folder is like. "exists" (default): a normal folder. "missing": not
   * there at all. "file": a regular file with that name, so nothing can be created beneath it,
   * which stands in for any folder the OS won't let the app write in.
   */
  documents?: "exists" | "missing" | "file";
  /**
   * Runs before the app starts. May create folders, and returns what to write as config.json: what
   * an earlier version, or earlier use, left behind. Returning nothing writes no config.
   */
  prepare?: (paths: Paths) => Record<string, unknown> | void;
  /** Makes SOMESCRIPT_LIBRARY point here (a developer/portable override). */
  library?: string;
}

export interface App extends Paths {
  url: string;
  configFile: string;
  page: Page;
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

async function waitUntilUp(url: string, child: ChildProcess, output: () => string) {
  const headers = release ? { cookie: `ss_token=${token}` } : undefined;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the app exited early:\n${output()}`);
    try {
      if ((await fetch(`${url}/api/health`, { headers })).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the app never came up at ${url}:\n${output()}`);
}

export const test = base.extend<{ launch: (options?: Launch) => Promise<App> }>({
  launch: async ({ browser }, use) => {
    const cleanups: Array<() => Promise<void>> = [];
    await use(async (options = {}) => {
      const root = mkdtempSync(join(tmpdir(), "somescript-e2e-"));
      const home = join(root, "home");
      const documents = join(root, "Documents");
      const config = join(root, "config");
      const data = join(root, "data");
      for (const dir of [home, config, data]) mkdirSync(dir, { recursive: true });
      if ((options.documents ?? "exists") === "exists") mkdirSync(documents);
      if (options.documents === "file") writeFileSync(documents, "not a folder");

      // Where the app keeps config.json: the OS's app-config dir (see tauri's PathResolver).
      const configFile =
        process.platform === "darwin"
          ? join(home, "Library", "Application Support", IDENTIFIER, "config.json")
          : join(config, IDENTIFIER, "config.json");
      const seeded = options.prepare?.({ root, home, documents });
      if (seeded) {
        mkdirSync(dirname(configFile), { recursive: true });
        writeFileSync(configFile, JSON.stringify(seeded));
      }

      const port = await freePort();
      const url = `http://127.0.0.1:${port}`;
      // The stand-in for Tectonic that playwright.config.ts writes (a shell script: not on Windows).
      const fakeEngine = join(here, ".run", "fake-tectonic");
      const env: Record<string, string> = {
        ...(process.env as Record<string, string>),
        SOMESCRIPT_HEADLESS: "1",
        SOMESCRIPT_DOCUMENTS_DIR: documents,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: config,
        XDG_DATA_HOME: data,
        APPDATA: config,
        LOCALAPPDATA: data,
        ...(existsSync(fakeEngine) ? { TECTONIC_BIN: fakeEngine } : {}),
        ...(release
          ? { SOMESCRIPT_PORT: String(port), SOMESCRIPT_TOKEN: token }
          : { SOMESCRIPT_DEV_API_PORT: String(port) }),
      };
      // The inherited environment may carry a developer's own override: only ours counts.
      delete env.SOMESCRIPT_LIBRARY;
      if (options.library) env.SOMESCRIPT_LIBRARY = options.library;

      let log = "";
      const child = spawn(appPath, [], { env, stdio: ["ignore", "pipe", "pipe"] });
      child.stdout?.on("data", (d) => (log += d));
      child.stderr?.on("data", (d) => (log += d));
      await waitUntilUp(url, child, () => log);

      const context = await browser.newContext({
        baseURL: url,
        viewport: { width: 1280, height: 900 },
        storageState: release
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
      });
      const page = await context.newPage();
      cleanups.push(async () => {
        await context.close();
        child.kill();
        await new Promise((r) => (child.exitCode === null ? child.once("exit", r) : r(null)));
        rmSync(root, { recursive: true, force: true });
      });
      return { url, root, documents, home, configFile, page };
    });
    for (const cleanup of cleanups.reverse()) await cleanup();
  },
});

export { expect } from "@playwright/test";
