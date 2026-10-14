import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect, test, type Page } from "@playwright/test";

const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, "..", ".run", "webview2-shots");
const appUrl = process.env.APP_URL;
const cdpUrl = process.env.CDP_URL ?? "http://127.0.0.1:9222";

async function shoot(page: Page, name: string) {
  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: join(shots, `${name}.png`) }).catch(() => undefined);
}

test("a first launch in the packaged app: setup makes the folder in Documents, then a project", async () => {
  expect(appUrl, "APP_URL must be the app's loopback URL").toBeTruthy();
  const browser = await chromium.connectOverCDP(cdpUrl);
  try {
    // The app's window is the one page on its own loopback address.
    let page: Page | undefined;
    await expect
      .poll(
        () => {
          page = browser
            .contexts()
            .flatMap((c) => c.pages())
            .find((p) => p.url().startsWith(appUrl!));
          return page !== undefined;
        },
        { message: "the app's window shows up over CDP", timeout: 60_000 },
      )
      .toBe(true);
    const app = page!;

    // The window loads /?t=<token>, which sets the cookie, then the dashboard sends a first run to setup.
    await expect(app).toHaveURL(/\/welcome/, { timeout: 60_000 });
    await shoot(app, "1-welcome");

    // Tauri's IPC reaches the page (the folder picker and "Show in folder" depend on it).
    expect(await app.evaluate(() => "__TAURI_INTERNALS__" in window)).toBe(true);

    const settings = await app.evaluate(() => fetch("/api/settings").then((r) => r.json()));
    expect(settings.onboarded).toBe(false);
    expect(
      existsSync(settings.defaultLibraryPath),
      "nothing has been created before the user confirms",
    ).toBe(false);

    await app.getByTestId("get-started").click();
    await expect(app.getByTestId("folder-status")).not.toHaveAttribute("data-state", "checking", {
      timeout: 30_000,
    });
    await shoot(app, "2-folder");
    await app.getByTestId("folder-continue").click();
    await expect(app.getByTestId("step-engine")).toBeVisible({ timeout: 30_000 });
    expect(
      existsSync(settings.defaultLibraryPath),
      `setup made ${settings.defaultLibraryPath}`,
    ).toBe(true);

    await app.getByTestId("engine-continue").click(); // "Skip for now"
    await app.getByLabel("Name", { exact: true }).fill("WebView2 smoke");
    await app.getByTestId("create-first").click();
    await expect(app).toHaveURL(/projectId=WebView2/, { timeout: 60_000 });
    await expect(app.locator(".cm-content")).toBeVisible({ timeout: 60_000 });
    expect(existsSync(join(settings.defaultLibraryPath, "WebView2 smoke", "main.tex"))).toBe(true);
    await shoot(app, "3-editor");
  } finally {
    await browser.close(); // disconnects; the app keeps running until the job stops it
  }
});
