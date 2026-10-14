import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "./first-run";

// First-run setup (apps/tauri/src/onboarding) and what happens when the projects folder isn't there or
// can't be used. Each test gets an app instance of its own (e2e/first-run.ts) with a fake home, Documents
// folder and config, because what is being tested is the state before anything has been set up.

test("a first launch goes to setup, and nothing is created until the user confirms", async ({
  launch,
}) => {
  const { page, documents } = await launch();
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/welcome/);
  await expect(page.getByTestId("step-welcome")).toBeVisible();
  await expect(page.getByText(join(documents, "SomeScript"))).toBeVisible();
  expect(
    existsSync(join(documents, "SomeScript")),
    "reading the settings must not make the folder",
  ).toBe(false);
});

test("setup creates the projects folder, is remembered, and ends in a first project", async ({
  launch,
}) => {
  const app = await launch();
  const { page } = app;
  const folder = join(app.documents, "SomeScript");

  await page.goto("/dashboard");
  await page.getByTestId("get-started").click();
  await expect(page.getByTestId("step-folder")).toBeVisible();
  await expect(page.getByTestId("folder-status")).toContainText("doesn't exist yet");
  await page.getByTestId("folder-continue").click();

  await expect(page.getByTestId("step-engine")).toBeVisible();
  expect(statSync(folder).isDirectory(), "the folder is made when the user confirms").toBe(true);
  expect(JSON.parse(readFileSync(app.configFile, "utf8"))).toMatchObject({ onboarded: true });
  await page.getByTestId("engine-continue").click(); // "Skip for now"

  await expect(page.getByTestId("step-project")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill("My Thesis");
  await page.getByTestId("create-first").click();
  await expect(page).toHaveURL(/projectId=My(%20|\+)Thesis/);
  await expect(page.locator(".cm-content")).toBeVisible();
  expect(existsSync(join(folder, "My Thesis", "main.tex"))).toBe(true);

  // Next time it goes straight to the projects.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: /^My Thesis/ })).toBeVisible();
});

test("a folder the system won't allow is explained, with a way out", async ({ launch }) => {
  // The Documents "folder" is a file, so nothing can be created under it: the same shape as a
  // protected Documents folder (Windows' Controlled folder access, a refused macOS prompt).
  const app = await launch({ documents: "file" });
  const { page } = app;
  await page.goto("/dashboard");
  await page.getByTestId("get-started").click();

  const status = page.getByTestId("folder-status");
  await expect(status).toHaveAttribute("data-state", "issue");
  await expect(status).not.toContainText("File not found");
  await expect(page.getByTestId("folder-continue")).toBeDisabled();

  // It offers folders that do work, outside the one that failed.
  const alternative = page.getByTestId("folder-alternative").first();
  await expect(alternative).toContainText(join(app.home, "SomeScript"));
  await alternative.click();
  await expect(status).toHaveAttribute("data-state", "ok");
  await page.getByTestId("folder-continue").click();
  await expect(page.getByTestId("step-engine")).toBeVisible();
  expect(statSync(join(app.home, "SomeScript")).isDirectory()).toBe(true);
});

test("skipping setup still makes the default folder, and can't skip past a broken one", async ({
  launch,
}) => {
  const ok = await launch();
  await ok.page.goto("/dashboard");
  await ok.page.getByTestId("skip-setup").click();
  await expect(ok.page).toHaveURL(/\/dashboard/);
  await expect(ok.page.getByText("No projects yet")).toBeVisible();
  expect(statSync(join(ok.documents, "SomeScript")).isDirectory()).toBe(true);

  const broken = await launch({ documents: "file" });
  await broken.page.goto("/dashboard");
  await broken.page.getByTestId("skip-setup").click();
  await expect(broken.page.getByTestId("step-folder")).toBeVisible();
  await expect(broken.page.getByTestId("folder-status")).toHaveAttribute("data-state", "issue");
});

test("the folder is checked as you type", async ({ launch }) => {
  const app = await launch();
  const { page } = app;
  await page.goto("/welcome");
  await page.getByTestId("get-started").click();
  const input = page.getByTestId("folder-path-input");
  const status = page.getByTestId("folder-status");

  await input.fill("relative/dir");
  await expect(status).toContainText("Enter the full path");
  await expect(page.getByTestId("folder-continue")).toBeDisabled();

  const file = join(app.root, "a-file");
  writeFileSync(file, "x");
  await input.fill(file);
  await expect(status).toContainText("file, not a folder");

  const mine = join(app.root, "Mine");
  await input.fill(mine);
  await expect(status).toContainText("SomeScript will create it");
  await page.getByTestId("folder-continue").click();
  await expect(page.getByTestId("step-engine")).toBeVisible();
  expect(existsSync(mine)).toBe(true);
});

test("a user of an earlier version who chose a folder is not sent through setup", async ({
  launch,
}) => {
  // 0.1.0 and 0.1.1 wrote only `libraryPath`.
  const { page } = await launch({
    prepare: ({ root }) => {
      const library = join(root, "My Papers");
      mkdirSync(join(library, "Thesis"), { recursive: true });
      return { libraryPath: library };
    },
  });
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("button", { name: /^Thesis/ })).toBeVisible();
});

test("a missing default folder no longer breaks creating a project (the reported bug)", async ({
  launch,
}) => {
  // Set up already, nothing chosen: the library is the default folder, which doesn't exist (here
  // Documents doesn't either). It used to be made once at launch; when that failed, creating a
  // project said "File not found".
  const app = await launch({ documents: "missing", prepare: () => ({ onboarded: true }) });
  const { page } = app;
  await page.goto("/dashboard");
  await expect(page.getByText("No projects yet")).toBeVisible();
  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Paper");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/projectId=Paper/);
  expect(existsSync(join(app.documents, "SomeScript", "Paper", "main.tex"))).toBe(true);
});

test("when the chosen folder has vanished, the app says which one instead of 'File not found'", async ({
  launch,
}) => {
  const app = await launch({
    prepare: ({ root }) => ({ libraryPath: join(root, "Unplugged"), onboarded: true }),
  });
  const { page } = app;
  await page.goto("/dashboard");
  const problem = page.getByTestId("library-error");
  await expect(problem).toContainText("Unplugged");
  await expect(problem).not.toContainText("File not found");

  await page.getByRole("button", { name: "New project" }).first().click();
  await page.getByLabel("Name", { exact: true }).fill("Paper");
  await page.getByRole("button", { name: "Create" }).click();
  const error = page.getByTestId("create-error");
  await expect(error).toContainText("Unplugged");
  await expect(error).not.toContainText("File not found");
  expect(existsSync(join(app.root, "Unplugged")), "a chosen folder isn't recreated empty").toBe(
    false,
  );
});

test("Run setup again starts at the folder step with the current folder", async ({ launch }) => {
  const app = await launch({
    prepare: ({ root }) => {
      const library = join(root, "Mine");
      mkdirSync(library);
      return { libraryPath: library, onboarded: true };
    },
  });
  const { page } = app;
  await page.goto("/settings?section=general");
  await page.getByTestId("run-setup-again").click();
  await expect(page).toHaveURL(/\/welcome\?rerun=1/);
  await expect(page.getByTestId("step-folder")).toBeVisible();
  await expect(page.getByTestId("folder-path-input")).toHaveValue(join(app.root, "Mine"));
  await expect(page.getByTestId("folder-continue")).toBeEnabled();
});

test("Settings can copy a diagnostics report, which holds no secrets", async ({ launch }) => {
  const app = await launch({
    prepare: ({ root }) => {
      const library = join(root, "Mine");
      mkdirSync(library);
      return { libraryPath: library, onboarded: true };
    },
  });
  const { page } = app;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.url });
  await page.goto("/settings?section=general");
  await page.getByRole("button", { name: "Copy diagnostics" }).click();
  await expect(page.getByText("Copied. Paste it into your bug report.")).toBeVisible();
  const report = await page.evaluate(() => navigator.clipboard.readText());
  expect(report).toContain("SomeScript ");
  expect(report).toContain(join(app.root, "Mine"));
  expect(report).toContain("tectonic:");
});
