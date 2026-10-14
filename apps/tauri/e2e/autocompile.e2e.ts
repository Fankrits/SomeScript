import { expect, openEditor, sidebarTab, test, typeInEditor } from "./fixtures";

// Auto-compile waits for this long after the last keystroke (apps/editor/lib/auto-compile.ts).
const IDLE_MS = 3000;

/** Counts `/api/compile` requests the page makes. */
function watchCompiles(page: import("@playwright/test").Page) {
  const times: number[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/compile")) times.push(Date.now());
  });
  return times;
}

test("opening a project does not compile by itself", async ({ page, project }) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await page.waitForTimeout(IDLE_MS + 1500);
  expect(compiles).toHaveLength(0);
});

// The regression: autosave (1s) made the buffer equal to the saved text, which cancelled the 3s
// timer, so with collaboration off (always, on desktop) auto-compile never ran.
test("compiles about three seconds after you stop typing, even though autosave runs first", async ({
  page,
  project,
  api,
}) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await expect(page.getByText("Click Compile to generate PDF")).toBeVisible();

  await typeInEditor(page, "\nAuto compile me.");
  const typedAt = Date.now();

  // Within the idle delay nothing happens...
  await page.waitForTimeout(IDLE_MS - 1000);
  expect(compiles).toHaveLength(0);
  // ...but the text is already saved (that is what used to cancel the compile)...
  expect(await api.files(project.id, "main.tex")).toContain("Auto compile me.");
  // ...and then it compiles, once.
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBe(1);
  expect(compiles[0] - typedAt).toBeGreaterThanOrEqual(IDLE_MS - 300);
  expect(compiles[0] - typedAt).toBeLessThan(IDLE_MS + 2500);

  // The result lands in the PDF pane.
  await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
  await expect(page.getByText("Click Compile to generate PDF")).toBeHidden();
  await expect(page.getByText("No compilation errors")).toBeVisible();
});

test("an idle editor does not keep recompiling, and the next edit compiles again", async ({
  page,
  project,
}) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await typeInEditor(page, "\nOne.");
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBe(1);

  await page.waitForTimeout(IDLE_MS + 1500);
  expect(compiles).toHaveLength(1);

  await typeInEditor(page, " Two.");
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBe(2);
});

test("keeps waiting while you keep typing", async ({ page, project }) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  for (let i = 0; i < 5; i++) {
    await page.keyboard.type(`word${i} `);
    await page.waitForTimeout(1200);
  }
  expect(compiles).toHaveLength(0);
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBe(1);
});

test("a compile error from auto-compile is shown quietly, without a toast", async ({
  page,
  project,
}) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await typeInEditor(page, "\n% FAKE_TEX_ERROR");
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBe(1);
  await expect(page.getByText("Undefined control sequence").first()).toBeVisible();
  await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  await expect(page.getByText("Click Compile to generate PDF")).toBeVisible();
});

test("the Compile button still compiles on demand", async ({ page, project }) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await expect.poll(() => compiles.length).toBe(1);
  await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
  // Compiling by hand counts as compiled: no second, automatic compile follows.
  await page.waitForTimeout(IDLE_MS + 1500);
  expect(compiles).toHaveLength(1);
});

test("turning Auto-Compile off stops it, the choice survives a reload, and turning it on restores it", async ({
  page,
  project,
  api,
}) => {
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await sidebarTab(page, "Settings").click();
  await page.locator("#auto-compile-toggle").uncheck();
  await expect.poll(async () => (await api.prefs(project.id)).autoCompileEnabled).toBe(false);

  await sidebarTab(page, "Files").click();
  await typeInEditor(page, "\nQuiet.");
  await page.waitForTimeout(IDLE_MS + 2500);
  expect(compiles).toHaveLength(0);

  await page.reload();
  await page.locator(".cm-content").waitFor();
  await sidebarTab(page, "Settings").click();
  await expect(page.locator("#auto-compile-toggle")).not.toBeChecked();
  await page.locator("#auto-compile-toggle").check();
  await expect.poll(async () => (await api.prefs(project.id)).autoCompileEnabled).toBe(true);

  await sidebarTab(page, "Files").click();
  await typeInEditor(page, " Loud.");
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBe(1);
});

test("switching files does not trigger a compile of the file you merely opened", async ({
  page,
  project,
  api,
}) => {
  await api.writeFile(project.id, "chapter.tex", "\\section{Chapter}\nText.\n");
  const compiles = watchCompiles(page);
  await openEditor(page, project);
  await page.getByText("chapter.tex", { exact: true }).click();
  await expect(page.locator(".cm-content")).toContainText("Chapter");
  await page.waitForTimeout(IDLE_MS + 1500);
  expect(compiles).toHaveLength(0);
  // Editing it does compile (the open file is tried first, then the main file).
  await typeInEditor(page, "\nMore.");
  await expect.poll(() => compiles.length, { timeout: 8000 }).toBeGreaterThanOrEqual(1);
});
