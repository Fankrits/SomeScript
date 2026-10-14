import { expect, openEditor, sidebarTab, test } from "./fixtures";

// The Tasks board in the sidebar (apps/editor/components/editor/tasks-panel.tsx), against the Rust
// /api/tasks routes. Every action must reach the project folder, because that is what survives.

const names = (tasks: any[], status?: string) =>
  tasks.filter((t) => !status || t.status === status).map((t) => t.name);

async function addTask(page: import("@playwright/test").Page, text: string) {
  const input = page.getByPlaceholder("Add a new task…");
  await input.fill(text);
  await input.press("Enter");
}

test("adds tasks, and they are saved in the project", async ({ page, project, api }) => {
  await openEditor(page, project);
  await sidebarTab(page, "Tasks").click();
  await expect(page.getByText("Start Planning")).toBeVisible();

  await addTask(page, "Write the intro");
  await addTask(page, "Add references");
  await expect(page.getByText("Write the intro")).toBeVisible();
  await expect(page.getByText("0/2 done")).toBeVisible();
  await expect
    .poll(async () => names(await api.tasks(project.id)))
    .toEqual(["Write the intro", "Add references"]);
  const saved = await api.tasks(project.id);
  expect(saved[0]).toMatchObject({ done: false, status: "todo" });
  expect(typeof saved[0].id).toBe("string");
});

test("ticking a task moves it to Finished, and unticking brings it back", async ({
  page,
  project,
  api,
}) => {
  await openEditor(page, project);
  await sidebarTab(page, "Tasks").click();
  await addTask(page, "Draft abstract");
  // Clicking (not .check()): the ticked task leaves the list at once, for the collapsed Finished group.
  await page.locator("[data-rfd-draggable-id] input[type=checkbox]").first().click();
  await expect
    .poll(async () => names(await api.tasks(project.id), "finished"))
    .toEqual(["Draft abstract"]);
  await expect(page.getByText("1/1 done")).toBeVisible();

  // Finished starts collapsed; open it and untick.
  await page.getByRole("button", { name: /Finished/ }).click();
  await page.locator("[data-rfd-draggable-id] input[type=checkbox]").first().click();
  await expect
    .poll(async () => names(await api.tasks(project.id), "todo"))
    .toEqual(["Draft abstract"]);
});

test("edits and deletes a task", async ({ page, project, api }) => {
  await openEditor(page, project);
  await sidebarTab(page, "Tasks").click();
  await addTask(page, "Fix typos");
  await addTask(page, "Remove me");

  const first = page.locator("[data-rfd-draggable-id]").filter({ hasText: "Fix typos" });
  await first.hover();
  await first.getByTitle("Edit task").click();
  await page.getByPlaceholder("Task name").fill("Fix typos in chapter 2");
  await page.getByPlaceholder("Description (optional)").fill("Check the bibliography too");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Fix typos in chapter 2")).toBeVisible();
  await expect(page.getByText("Check the bibliography too")).toBeVisible();

  const second = page.locator("[data-rfd-draggable-id]").filter({ hasText: "Remove me" });
  await second.hover();
  await second.getByTitle("Delete task").click();
  await expect(page.getByText("Remove me")).toHaveCount(0);
  await expect
    .poll(async () => names(await api.tasks(project.id)))
    .toEqual(["Fix typos in chapter 2"]);
  expect((await api.tasks(project.id))[0].description).toBe("Check the bibliography too");
});

test("dragging a task between columns changes its status", async ({ page, project, api }) => {
  await openEditor(page, project);
  await sidebarTab(page, "Tasks").click();
  await addTask(page, "Move me");

  const handle = page.locator("[data-rfd-drag-handle-draggable-id]").first();
  const target = page.locator('[data-rfd-droppable-id="ongoing"]');
  const from = (await handle.boundingBox())!;
  const to = (await target.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 12, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
  await page.mouse.up();

  await expect.poll(async () => names(await api.tasks(project.id), "ongoing")).toEqual(["Move me"]);
  await expect(page.locator('[data-rfd-droppable-id="ongoing"]')).toContainText("Move me");
});

test("right-click -> Create task from a selection keeps where it came from", async ({
  page,
  project,
  api,
}) => {
  await openEditor(page, project);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.locator(".cm-content").click({ button: "right" });
  await page
    .getByText(/Create task/i)
    .first()
    .click();

  await page.locator("#task-name-input").fill("Review the whole preamble");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Review the whole preamble")).toBeVisible();

  await expect.poll(async () => (await api.tasks(project.id)).length).toBe(1);
  const [task] = await api.tasks(project.id);
  expect(task.name).toBe("Review the whole preamble");
  expect(task.description).toContain("\\documentclass{article}");
  expect(task.source).toMatchObject({ path: "main.tex", line: 1 });

  // The source chip jumps back to the file.
  await page.getByRole("button", { name: /main\.tex:1/ }).click();
  await expect(page.locator(".cm-content")).toBeVisible();
});

test("tasks survive a reload and belong to their own project", async ({
  page,
  project,
  api,
  request,
}) => {
  await openEditor(page, project);
  await sidebarTab(page, "Tasks").click();
  await addTask(page, "Persist me");
  await expect.poll(async () => names(await api.tasks(project.id))).toEqual(["Persist me"]);

  await page.reload();
  await page.locator(".cm-content").waitFor();
  await sidebarTab(page, "Tasks").click();
  await expect(page.getByText("Persist me")).toBeVisible();

  const other = await request
    .post("/api/projects", { data: { name: `e2e-other-${Date.now()}`, template: "blank" } })
    .then((r) => r.json());
  expect(await api.tasks(other.id)).toEqual([]);
});

test("selecting text in the PDF and choosing Create task saves it with its page", async ({
  page,
  project,
  api,
}) => {
  await openEditor(page, project);
  await page.getByRole("button", { name: "Compile", exact: true }).click();
  await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
  // The stand-in engine's PDF is one line of text. The viewer takes about a second after the
  // compile to make it selectable, so the first drag often selects nothing: retry until it does.
  const line = { x: 965, y: 262 };
  await expect(async () => {
    // Every try starts with the menu closed: the one a failed try leaves open swallows the next drag.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0, { timeout: 1_000 });
    await page.mouse.move(line.x, line.y);
    await page.mouse.down();
    await page.mouse.move(1200, line.y, { steps: 8 });
    await page.mouse.move(1305, line.y, { steps: 8 });
    await page.mouse.up();
    await page.mouse.click(1100, line.y, { button: "right" });
    await expect(page.getByRole("menuitem", { name: "Create task from selection" })).toBeEnabled({
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  await page.getByRole("menuitem", { name: "Create task from selection" }).click();

  // The selected text is offered as the name and the description.
  await expect(page.locator("#task-name-input")).toHaveValue("Compiled by the test engine");
  await page.getByRole("button", { name: "Add task" }).click();

  await expect.poll(async () => (await api.tasks(project.id)).length).toBe(1);
  const [task] = await api.tasks(project.id);
  expect(task.name).toBe("Compiled by the test engine");
  expect(task.description).toContain("Compiled by the test engine");
  expect(task.source).toMatchObject({ page: 1 });
  await expect(page.getByRole("button", { name: /p\. 1/ })).toBeVisible();
});
