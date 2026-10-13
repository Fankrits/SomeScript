import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";
import { MockProvider } from "./mock-provider";

export { expect };

export interface Project {
  id: string;
}

export interface Api {
  /** Saves a provider straight through the API (for tests that aren't about the Settings form). */
  addProvider(p: {
    name?: string;
    baseUrl: string;
    apiKey?: string;
    kind?: "openai" | "anthropic";
    models?: string[];
    defaultModel?: string;
  }): Promise<string>;
  settings(): Promise<any>;
  files(project: string, path: string): Promise<string>;
  writeFile(project: string, path: string, content: string): Promise<void>;
  tasks(project: string): Promise<any[]>;
  prefs(project: string): Promise<any>;
}

/**
 * Fake API keys are assembled, not written out: the repo's secret scanner flags anything shaped
 * like a key, test fixtures included. The label keeps them recognisable in a failure message, and
 * the tail is what the Settings screen shows as the key hint.
 */
export const testKey = (label: string, tail = "0000") => ["test", label, tail].join("-");
export const DEFAULT_KEY = testKey("e2e", "6789");

let counter = 0;
const unique = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}${(counter++).toString(36)}`;

async function ok(res: Awaited<ReturnType<APIRequestContext["get"]>>) {
  if (!res.ok()) throw new Error(`${res.url()} -> ${res.status()} ${await res.text()}`);
  return res.json();
}

export const test = base.extend<{ provider: MockProvider; api: Api; project: Project }>({
  provider: async ({}, use) => {
    const provider = await new MockProvider().start();
    await use(provider);
    await provider.close();
  },

  api: async ({ request }, use) => {
    const post = (path: string, data: unknown) => request.post(path, { data }).then(ok);
    // Providers and instructions are global, so every test starts from none.
    const reset = async () => {
      const { providers } = await request.get("/api/ai/settings").then(ok);
      for (const p of providers) await post("/api/ai/providers/delete", { id: p.id });
      await post("/api/ai/settings", { customInstructions: "" });
    };
    await reset();
    await use({
      addProvider: async (p) =>
        (
          await post("/api/ai/providers", {
            name: p.name ?? "Mock",
            kind: p.kind ?? "openai",
            baseUrl: p.baseUrl,
            apiKey: p.apiKey ?? DEFAULT_KEY,
            models: p.models ?? ["mock-small", "mock-large"],
            defaultModel: p.defaultModel ?? "mock-small",
          })
        ).provider.id,
      settings: () => request.get("/api/ai/settings").then(ok),
      files: async (project, path) =>
        (
          await request
            .get(
              `/api/files?projectId=${encodeURIComponent(project)}&path=${encodeURIComponent(path)}`,
            )
            .then(ok)
        ).content,
      writeFile: async (project, path, content) => {
        await post("/api/files", { projectId: project, action: "save", path, content });
      },
      tasks: async (project) =>
        (await request.get(`/api/tasks?projectId=${encodeURIComponent(project)}`).then(ok)).tasks,
      prefs: async (project) =>
        (await request.get(`/api/editor-prefs?projectId=${encodeURIComponent(project)}`).then(ok))
          .prefs,
    });
    await reset();
  },

  project: async ({ request }, use) => {
    const { id } = await request
      .post("/api/projects", { data: { name: unique("e2e"), template: "blank" } })
      .then(ok);
    await use({ id });
  },
});

// ---- page helpers ------------------------------------------------------------------------

export async function openEditor(page: Page, project: Project) {
  await page.goto(`/?projectId=${encodeURIComponent(project.id)}`);
  await page.locator(".cm-content").waitFor();
}

/** Appends text at the end of the open document, typing like a person. */
export async function typeInEditor(page: Page, text: string) {
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(text, { delay: 10 });
}

export const sidebarTab = (page: Page, name: "Files" | "Agent" | "Search" | "Tasks" | "Settings") =>
  page.getByRole("tab", { name, exact: true });

export async function openChat(page: Page) {
  await sidebarTab(page, "Agent").click();
  await page.getByTestId("chat-thread").waitFor();
}

export async function ask(page: Page, text: string) {
  const input = page.getByTestId("chat-input");
  await input.fill(text);
  await input.press("Enter");
}

/** The answer has fully arrived: the Stop button is gone again. */
export async function waitForTurnEnd(page: Page) {
  await expect(page.getByTestId("chat-stop")).toHaveCount(0, { timeout: 30_000 });
}
