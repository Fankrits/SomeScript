import { expect, test } from "./fixtures";

// The dashboard (apps/tauri/src/library): projects are folders in the library.

/** A project (or trash) row. Scoped to <main>: toasts are list items too. */
const row = (page: import("@playwright/test").Page, text: string) =>
  page.locator("main li").filter({ hasText: text });

let n = 0;
const name = (p: string) => `${p} ${Date.now().toString(36)}${n++}`;

test("creates a project from the Starter template and opens it in the editor", async ({
  page,
  api,
}) => {
  const project = name("Starter");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill(project);
  await expect(page.getByRole("radio", { name: /Starter/ })).toBeChecked();
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(
    new RegExp(`projectId=${encodeURIComponent(project).replace(/%20/g, "(%20|\\+)")}`),
  );
  await expect(page.locator(".cm-content")).toBeVisible();
  expect(await api.files(project, "main.tex")).toContain("\\documentclass");
  await expect(
    page.getByTestId("breadcrumb-project").or(page.getByText(project).first()),
  ).toBeVisible();
});

test("a blank project is minimal, and a name that is already taken gets a number", async ({
  page,
  request,
  api,
}) => {
  const project = name("Blank");
  const first = await request
    .post("/api/projects", { data: { name: project, template: "blank" } })
    .then((r) => r.json());
  expect(first.id).toBe(project);
  expect(await api.files(project, "main.tex")).not.toContain("fontspec");

  await page.goto("/dashboard");
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill(project);
  await page.getByRole("radio", { name: /Blank/ }).check();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/projectId=/);
  const listed = await request.get("/api/projects").then((r) => r.json());
  expect(listed.projects.map((p: { id: string }) => p.id)).toContain(`${project} 2`);
});

test("lists projects, and clicking one opens it", async ({ page, request }) => {
  const project = name("Open me");
  await request.post("/api/projects", { data: { name: project, template: "blank" } });
  await page.goto("/dashboard");
  await page
    .getByRole("button", { name: new RegExp(project) })
    .first()
    .click();
  await expect(page).toHaveURL(/projectId=/);
  await expect(page.locator(".cm-content")).toContainText("documentclass");
});

test("renames a project (its folder too)", async ({ page, request, api }) => {
  const project = name("Old name");
  const renamed = name("New name");
  await request.post("/api/projects", { data: { name: project, template: "blank" } });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: `Actions for ${project}` }).click();
  await page.getByRole("menuitem", { name: /Rename/ }).click();
  await page.getByLabel("Project name").fill(renamed);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await expect(row(page, renamed)).toBeVisible();
  await expect(row(page, project)).toHaveCount(0);
  expect(await api.files(renamed, "main.tex")).toContain("\\documentclass");
});

test("exports a project as a ZIP and imports that ZIP as a new project", async ({
  page,
  request,
  api,
}) => {
  const project = name("Round trip");
  await request.post("/api/projects", { data: { name: project, template: "blank" } });
  await api.writeFile(project, "chapters/one.tex", "\\section{One}\n");

  await page.goto("/dashboard");
  await page.getByRole("button", { name: `Actions for ${project}` }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Export as ZIP/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${project}.zip`);
  const path = await file.path();
  expect(path).toBeTruthy();

  const imported = name("Imported");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await page.getByLabel("ZIP file").setInputFiles(path!);
  await page.getByLabel("Project name").fill(imported);
  await page.getByRole("button", { name: "Import", exact: true }).last().click();
  await expect(page).toHaveURL(/projectId=/);
  // The imported project opens its main file, not an empty editor.
  await expect(page.locator(".cm-content")).toContainText("documentclass");
  expect(await api.files(imported, "chapters/one.tex")).toContain("\\section{One}");
  expect(await api.files(imported, "main.tex")).toContain("\\documentclass");
});

test("moves a project to the trash, restores it, and deletes another one for good", async ({
  page,
  request,
  api,
}) => {
  const keep = name("Keep");
  const doomed = name("Doomed");
  for (const p of [keep, doomed])
    await request.post("/api/projects", { data: { name: p, template: "blank" } });

  await page.goto("/dashboard");
  await page.getByRole("button", { name: `Actions for ${keep}` }).click();
  await page.getByRole("menuitem", { name: /Move to trash/ }).click();
  await expect(row(page, keep)).toHaveCount(0);

  await page.getByRole("tab", { name: /Trash/ }).click();
  await expect(row(page, keep)).toContainText("removed for good in 7 days");
  await row(page, keep).getByRole("button", { name: "Restore" }).click();
  await page.getByRole("tab", { name: /Projects/ }).click();
  await expect(row(page, keep)).toBeVisible();
  expect(await api.files(keep, "main.tex")).toContain("\\documentclass");

  // Permanent deletion asks first.
  await page.getByRole("button", { name: `Actions for ${doomed}` }).click();
  await page.getByRole("menuitem", { name: /Move to trash/ }).click();
  await page.getByRole("tab", { name: /Trash/ }).click();
  await row(page, doomed).getByRole("button", { name: "Delete forever" }).click();
  await expect(page.getByRole("alertdialog")).toContainText(`Delete “${doomed}” forever?`);
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete forever" }).click();
  await expect(row(page, doomed)).toHaveCount(0);
});

test("the library folder can be changed, and projects there are listed", async ({
  page,
  request,
}) => {
  const current = (await request.get("/api/settings").then((r) => r.json())).libraryPath as string;
  const other = `${current}-other`;
  try {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "More options" }).click();
    await page.getByRole("menuitem", { name: /Change library folder/ }).click();
    await page.getByLabel("Folder path").fill(other);
    await page.getByRole("button", { name: "Use this folder" }).click();
    await expect(page.getByText("No projects yet")).toBeVisible();
    await expect(page.getByText(other)).toBeVisible();
  } finally {
    await request.post("/api/settings", { data: { libraryPath: current } });
  }
});

test("the New project dialog says what the folder will be called when it differs from the name", async ({
  page,
}) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "New project" }).first().click();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("a/b");
  await expect(page.getByTestId("folder-name-preview")).toContainText("a-b");
  await name.fill("A plain name");
  await expect(page.getByTestId("folder-name-preview")).toHaveCount(0);
});
