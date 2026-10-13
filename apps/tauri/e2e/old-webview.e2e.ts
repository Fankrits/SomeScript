import { expect, openEditor, sidebarTab, test } from "./fixtures";

// tauri.conf's minimumSystemVersion is macOS 12.0, whose WebKit can be as old as Safari 15.0 until the
// user updates Safari: no crypto.randomUUID, Array#at and Object.hasOwn (15.4), no Array#toSorted and
// #toReversed (16.0). The editor uses all of them, so the desktop app polyfills them
// (src/shims/polyfills.ts). This strips them before any page script runs, as such a webview would.

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const remove = (target: object, key: string) =>
      Object.defineProperty(target, key, { value: undefined, configurable: true, writable: true });
    remove(Crypto.prototype, "randomUUID");
    remove(Array.prototype, "at");
    remove(Array.prototype, "toSorted");
    remove(Array.prototype, "toReversed");
    remove(Object, "hasOwn");
  });
});

test("the polyfills put the missing APIs back", async ({ page, project }) => {
  await openEditor(page, project);
  // The e2e tsconfig predates ES2023, so the methods under test are reached untyped.
  const present = await page.evaluate(() => {
    const list = [3, 1, 2] as any;
    return {
      randomUUID: typeof crypto.randomUUID,
      at: typeof list.at,
      toSorted: typeof list.toSorted,
      toReversed: typeof list.toReversed,
      hasOwn: typeof (Object as any).hasOwn,
      sorted: list.toSorted().join(),
      last: list.at(-1),
    };
  });
  expect(present).toEqual({
    randomUUID: "function",
    at: "function",
    toSorted: "function",
    toReversed: "function",
    hasOwn: "function",
    sorted: "1,2,3",
    last: 2,
  });
});

test("tasks can be added", async ({ page, project, api }) => {
  await openEditor(page, project);
  await sidebarTab(page, "Tasks").click();
  const input = page.getByPlaceholder("Add a new task…");
  await input.fill("Still works");
  await input.press("Enter");
  await expect(page.getByText("Still works")).toBeVisible();
  await expect
    .poll(async () => (await api.tasks(project.id)).map((t: any) => t.name))
    .toEqual(["Still works"]);
  const [task] = await api.tasks(project.id);
  expect(task.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("files list in order and the project compiles", async ({ page, project, api }) => {
  await api.writeFile(project.id, "b.tex", "b");
  await api.writeFile(project.id, "a.tex", "a");
  await openEditor(page, project);
  const files = page.locator("#sidebar-panel-files");
  await expect(files.getByText("a.tex", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
});

test("search works", async ({ page, project, api }) => {
  await api.writeFile(project.id, "a.tex", "needle here\n");
  await openEditor(page, project);
  await sidebarTab(page, "Search").click();
  await page.locator("#sidebar-panel-search").getByPlaceholder("Search").fill("needle");
  await expect(page.locator("#sidebar-panel-search")).toContainText("a.tex");
});
