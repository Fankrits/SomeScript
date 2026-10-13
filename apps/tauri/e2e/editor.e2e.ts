import { expect, openEditor, sidebarTab, test, typeInEditor } from "./fixtures";
import type { Page } from "@playwright/test";

// The editor's own features (apps/editor, shared with the cloud app) running on the desktop server:
// files, search, settings, PDF, terminal. They are the parts of the UI that depend on the Rust API
// behaving exactly like the cloud routes.

const filesPanel = (page: Page) => page.locator("#sidebar-panel-files");
const fileNode = (page: Page, name: string) => filesPanel(page).getByText(name, { exact: true });
const treePaths = async (request: Page["request"], project: string) => {
  const res = await request
    .get(`/api/files?projectId=${encodeURIComponent(project)}`)
    .then((r) => r.json());
  const out: string[] = [];
  const walk = (nodes: { path: string; children?: unknown[] }[]) =>
    nodes.forEach((n) => {
      out.push(n.path);
      if (n.children) walk(n.children as never);
    });
  walk(res.tree);
  return out;
};

test.describe("files", () => {
  test("creates, renames, duplicates and deletes a file from the tree", async ({
    page,
    project,
    request,
  }) => {
    await openEditor(page, project);

    await page.getByTitle("New File").click();
    await expect(fileNode(page, "untitled.tex")).toBeVisible();
    expect(await treePaths(request, project.id)).toContain("untitled.tex");

    await fileNode(page, "untitled.tex").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("chapter1.tex");
    await page.keyboard.press("Enter");
    await expect(fileNode(page, "chapter1.tex")).toBeVisible();
    await expect
      .poll(() => treePaths(request, project.id))
      .toEqual(expect.arrayContaining(["chapter1.tex", "main.tex"]));
    expect(await treePaths(request, project.id)).not.toContain("untitled.tex");

    await fileNode(page, "chapter1.tex").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Duplicate" }).click();
    await expect.poll(async () => (await treePaths(request, project.id)).length).toBe(3);
    const copy = (await treePaths(request, project.id)).find(
      (p) => p !== "main.tex" && p !== "chapter1.tex",
    )!;
    expect(copy).toMatch(/chapter1.*\.tex/);

    await fileNode(page, copy).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: /Delete/ })
      .click();
    await expect.poll(() => treePaths(request, project.id)).not.toContain(copy);
  });

  test("creates a folder, uploads a file, and downloads one", async ({ page, project, api }) => {
    await openEditor(page, project);
    await page.getByTitle("New Folder").click();
    await expect(filesPanel(page).getByText("untitled-folder")).toBeVisible();

    await page
      .locator("input[type=file][multiple]")
      .first()
      .setInputFiles({
        name: "notes.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("uploaded text"),
      });
    await expect(fileNode(page, "notes.txt")).toBeVisible();
    expect(await api.files(project.id, "notes.txt")).toBe("uploaded text");

    await fileNode(page, "notes.txt").click({ button: "right" });
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe("notes.txt");
  });

  test("an edit is saved without pressing anything, and switching files keeps each file's own text", async ({
    page,
    project,
    api,
  }) => {
    await api.writeFile(project.id, "other.tex", "OTHER FILE\n");
    await openEditor(page, project);
    await typeInEditor(page, "\nedited main");
    await expect.poll(() => api.files(project.id, "main.tex")).toContain("edited main");

    await fileNode(page, "other.tex").click();
    await expect(page.locator(".cm-content")).toContainText("OTHER FILE");
    await expect(page.locator(".cm-content")).not.toContainText("edited main");
    await fileNode(page, "main.tex").click();
    await expect(page.locator(".cm-content")).toContainText("edited main");
    expect(await api.files(project.id, "other.tex")).toBe("OTHER FILE\n");
  });

  test("a file changed on disk by something else shows up after the tree refreshes", async ({
    page,
    project,
    api,
  }) => {
    await openEditor(page, project);
    await api.writeFile(project.id, "arrived.tex", "from outside");
    // The assistant (and any external write) announces itself with this event.
    await page.evaluate(() =>
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace")),
    );
    await expect(fileNode(page, "arrived.tex")).toBeVisible();
  });
});

test.describe("search", () => {
  test("finds text across files and replaces it everywhere", async ({ page, project, api }) => {
    await api.writeFile(project.id, "a.tex", "alpha beta\nbeta again\n");
    await api.writeFile(project.id, "b.tex", "no match here\nBETA upper\n");
    await openEditor(page, project);
    await sidebarTab(page, "Search").click();
    const panel = page.locator("#sidebar-panel-search");
    await panel.getByPlaceholder("Search").fill("beta");
    await expect(panel).toContainText("a.tex");
    await expect(panel).toContainText("b.tex");

    await panel.getByPlaceholder("Replace").fill("gamma");
    await panel.getByRole("button", { name: /replace all/i }).click();
    await expect.poll(() => api.files(project.id, "a.tex")).toBe("alpha gamma\ngamma again\n");
    expect(await api.files(project.id, "b.tex")).toBe("no match here\ngamma upper\n");
  });
});

test.describe("settings tab", () => {
  test("the editor toggles are saved per project and survive a reload", async ({
    page,
    project,
    api,
  }) => {
    await openEditor(page, project);
    await sidebarTab(page, "Settings").click();
    const panel = page.locator("#sidebar-panel-settings");
    for (const label of ["Code Folding", "Bracket Matching"]) {
      await panel.getByLabel(label).uncheck();
    }
    await panel.getByLabel("Vim Keybindings").check();
    await expect.poll(async () => (await api.prefs(project.id)).vimModeEnabled).toBe(true);
    const prefs = await api.prefs(project.id);
    expect(prefs).toMatchObject({
      foldingEnabled: false,
      bracketMatchingEnabled: false,
      vimModeEnabled: true,
      autoCompileEnabled: true,
    });

    await page.reload();
    await page.locator(".cm-content").waitFor();
    await sidebarTab(page, "Settings").click();
    await expect(panel.getByLabel("Vim Keybindings")).toBeChecked();
    await expect(panel.getByLabel("Code Folding")).not.toBeChecked();
  });

  test("the main file can be chosen, and Download PDF then builds that one", async ({
    page,
    project,
    api,
  }) => {
    await api.writeFile(
      project.id,
      "thesis.tex",
      "\\documentclass{article}\\begin{document}Thesis\\end{document}\n",
    );
    await openEditor(page, project);
    await sidebarTab(page, "Settings").click();
    await page.locator("#sidebar-panel-settings").getByRole("combobox").first().click();
    await page.getByRole("option", { name: "thesis.tex" }).click();
    await expect
      .poll(
        async () =>
          (
            await page.request
              .get(`/api/project-settings?projectId=${project.id}`)
              .then((r) => r.json())
          ).settings.mainFilePath,
      )
      .toBe("thesis.tex");

    // Download PDF always builds the project's main file, whatever is open.
    const compile = page.waitForRequest((r) => r.url().endsWith("/api/compile"));
    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await compile;
    await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
    const built = page.waitForRequest((r) => r.url().endsWith("/api/compile"));
    await page.getByRole("button", { name: /Download PDF/ }).click();
    expect((await built).postDataJSON().path).toBe("thesis.tex");
  });
});

test.describe("pdf and terminal", () => {
  test("Compile shows the PDF, and Download PDF saves it", async ({ page, project }) => {
    await openEditor(page, project);
    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Download PDF/ }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/);
  });

  test("the terminal shows the compile log, and Send to chat attaches it to the assistant", async ({
    page,
    project,
    provider,
    api,
  }) => {
    await api.addProvider({ baseUrl: provider.openai });
    await api.writeFile(
      project.id,
      "main.tex",
      "\\documentclass{article}\n% FAKE_TEX_ERROR\n\\begin{document}\\end{document}\n",
    );
    await openEditor(page, project);
    await page.getByRole("button", { name: "Compile", exact: true }).click();
    await expect(page.getByText("Undefined control sequence").first()).toBeVisible();
    await page.getByRole("button", { name: "Send to chat" }).click();
    await expect(page.getByTestId("attachments")).toBeVisible();
  });
});
