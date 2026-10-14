import { expect, test, testKey } from "./fixtures";

const KEY = testKey("settings", "4321");
const ORIGINAL = testKey("original", "1111");
// "reject" in a key makes the scripted provider answer 401 to everything.
const REJECTED = testKey("reject", "0000");

test("the dashboard has a Settings button that opens the app-wide settings", async ({
  page,
  api,
}) => {
  void api;
  await page.goto("/dashboard");
  await page.getByTestId("open-settings").click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("apply to the whole app, not to one project")).toBeVisible();
  await expect(page.getByTestId("no-providers")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test("adds a custom endpoint, lists and picks its models, tests it, and never shows the key again", async ({
  page,
  provider,
  api,
}) => {
  await page.goto("/settings");
  await page.getByTestId("add-provider").click();
  await page.getByTestId("preset-custom").click();

  await page.getByLabel("Name", { exact: true }).fill("My gateway");
  await page.getByLabel("Base URL").fill(provider.openai);
  await page.getByLabel("API key").fill(KEY);

  await page.getByTestId("test-connection").click();
  await expect(page.getByTestId("connection-result")).toContainText(
    "Connected. 3 models available.",
  );
  const modelsCall = provider.requests.find((r) => r.method === "GET");
  expect(modelsCall?.path).toBe("/v1/models");
  expect(modelsCall?.headers.authorization).toBe(`Bearer ${KEY}`);

  // Pick two of the fetched models; the first becomes the default.
  await page.getByTestId("fetch-models").click();
  await page.getByTestId("fetched-models").getByRole("button", { name: "+ mock-large" }).click();
  await page.getByTestId("fetched-models").getByRole("button", { name: "+ mock-small" }).click();
  await expect(page.getByTestId("model-chips")).toContainText("mock-large");
  await expect(page.getByTestId("model-chips")).toContainText("mock-small");

  await page.getByTestId("test-chat").click();
  await expect(page.getByTestId("chat-result")).toContainText("The model answered");
  const probe = provider.chatRequests().at(-1)!;
  expect(probe.body.model).toBe("mock-large");

  await page.getByTestId("save-provider").click();
  const card = page.getByTestId("provider-My gateway");
  await expect(card).toBeVisible();
  await expect(card).toContainText("In use");
  await expect(card).toContainText("…4321");
  await expect(card).toContainText("mock-large");

  // The key is stored by the app but never handed back, to this page or any other caller.
  const body = JSON.stringify(await api.settings());
  expect(body).not.toContain(KEY);
  expect(body).not.toContain("test-settings");
  await page.reload();
  await expect(page.getByTestId("provider-My gateway")).toContainText("…4321");
  await expect(page.locator("body")).not.toContainText(KEY);
});

test("editing keeps the saved key unless it is replaced or removed", async ({
  page,
  provider,
  api,
}) => {
  await api.addProvider({
    name: "Keeper",
    baseUrl: provider.openai,
    apiKey: ORIGINAL,
  });
  await page.goto("/settings");

  // Rename only: the stored key must keep working.
  await page.getByRole("button", { name: "Edit Keeper" }).click();
  const key = page.getByLabel("API key");
  await expect(key).toHaveAttribute("placeholder", /Saved \(…1111\)/);
  await expect(key).toHaveValue("");
  await page.getByLabel("Name", { exact: true }).fill("Keeper 2");
  await page.getByTestId("test-connection").click();
  await expect(page.getByTestId("connection-result")).toContainText("Connected");
  expect(provider.requests.at(-1)!.headers.authorization).toBe(`Bearer ${ORIGINAL}`);
  await page.getByTestId("save-provider").click();
  await expect(page.getByTestId("provider-Keeper 2")).toContainText("…1111");

  // Replace it.
  await page.getByRole("button", { name: "Edit Keeper 2" }).click();
  await page.getByLabel("API key").fill(testKey("replacement", "2222"));
  await page.getByTestId("save-provider").click();
  await expect(page.getByTestId("provider-Keeper 2")).toContainText("…2222");

  // Remove it.
  await page.getByRole("button", { name: "Edit Keeper 2" }).click();
  await page.getByLabel("Remove the saved key").check();
  await page.getByTestId("save-provider").click();
  await expect(page.getByTestId("provider-Keeper 2")).toContainText("no key");
  expect((await api.settings()).providers[0].hasKey).toBe(false);
});

test("a bad base URL is refused with the reason, and nothing is saved", async ({ page, api }) => {
  await page.goto("/settings");
  await page.getByTestId("add-provider").click();
  await page.getByTestId("preset-custom").click();
  await page.getByLabel("Name", { exact: true }).fill("Broken");
  await page.getByLabel("Base URL").fill("ftp://example.com/v1");
  await page.getByTestId("save-provider").click();
  await expect(page.getByText("Base URL must start with http:// or https://")).toBeVisible();
  expect((await api.settings()).providers).toEqual([]);
});

test("a rejected key or an unreachable server is explained on the test buttons", async ({
  page,
  provider,
}) => {
  await page.goto("/settings");
  await page.getByTestId("add-provider").click();
  await page.getByTestId("preset-custom").click();
  await page.getByLabel("Name", { exact: true }).fill("Nowhere");
  await page.getByLabel("Base URL").fill("http://127.0.0.1:9/v1");
  await page.getByTestId("test-connection").click();
  await expect(page.getByTestId("connection-result")).toContainText("Couldn't reach Nowhere");

  await page.getByLabel("Base URL").fill(provider.openai);
  await page.getByLabel("API key").fill(REJECTED);
  await page.getByTestId("test-connection").click();
  await expect(page.getByTestId("connection-result")).toContainText("rejected the API key (401)");
  // The provider echoed the key in its error; the app must not show it.
  await expect(page.locator("body")).not.toContainText(REJECTED);

  // Without a model there is nothing to send a test message to.
  await expect(page.getByTestId("test-chat")).toBeDisabled();
  await page.locator("#p-model-input").fill("mock-small");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByTestId("test-chat")).toBeEnabled();
  await page.getByTestId("test-chat").click();
  await expect(page.getByTestId("chat-result")).toContainText("rejected the API key");
});

test("presets pre-fill the form, and local servers need no key", async ({ page }) => {
  await page.goto("/settings");
  await page.getByTestId("add-provider").click();
  await page.getByTestId("preset-ollama").click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Ollama (local)");
  await expect(page.getByLabel("Base URL")).toHaveValue("http://localhost:11434/v1");
  await expect(page.getByLabel("API key")).toHaveAttribute("placeholder", "Optional");
  // A local model's small default context window is the usual reason its tool calls fail.
  await expect(page.getByText("OLLAMA_CONTEXT_LENGTH=16384")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByTestId("preset-lmstudio").click();
  await expect(page.getByLabel("Base URL")).toHaveValue("http://localhost:1234/v1");
  await expect(page.getByText("Context Length of 16384")).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await page.getByTestId("preset-anthropic").click();
  await expect(page.getByLabel("Base URL")).toHaveValue("https://api.anthropic.com");
  await expect(page.getByRole("link", { name: /Get a key/ })).toHaveAttribute(
    "href",
    /console\.anthropic\.com/,
  );
  await page.getByText("Advanced").click();
  await expect(page.getByLabel("API style")).toHaveValue("anthropic");
});

test("switches the provider in use and removes one, keeping the rest", async ({
  page,
  provider,
  api,
}) => {
  const a = await api.addProvider({ name: "First", baseUrl: provider.openai });
  await api.addProvider({ name: "Second", baseUrl: provider.openai });
  await page.goto("/settings");
  await expect(page.getByTestId("provider-First")).toContainText("In use");
  await expect(page.getByTestId("provider-Second")).not.toContainText("In use");

  await page.getByTestId("provider-Second").getByRole("button", { name: "Use" }).click();
  await expect(page.getByTestId("provider-Second")).toContainText("In use");
  expect((await api.settings()).activeProviderId).not.toBe(a);

  await page.getByRole("button", { name: "Remove Second" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("provider-Second")).toHaveCount(0);
  await expect(page.getByTestId("provider-First")).toContainText("In use");
});

test("custom instructions are saved and reach the model", async ({
  page,
  provider,
  api,
  project,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await page.goto("/settings");
  await page.getByTestId("custom-instructions").fill("Always answer in exactly one sentence.");
  await page.getByTestId("save-instructions").click();
  await expect(page.getByTestId("save-instructions")).toBeDisabled();
  expect((await api.settings()).customInstructions).toBe("Always answer in exactly one sentence.");

  await page.goto(`/?projectId=${project.id}`);
  await page.getByRole("tab", { name: "Agent" }).click();
  await page.getByTestId("chat-input").fill("hello");
  await page.getByTestId("chat-input").press("Enter");
  await expect(page.getByTestId("assistant-text").first()).toContainText("markdown");
  const system = provider.chatRequests().at(-1)!.body.messages[0].content as string;
  expect(system).toContain("Always answer in exactly one sentence.");
});

test("the General tab shows where projects are stored", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByTestId("add-provider").first()).toBeVisible();
  await expect(page.getByTestId("library-path")).toContainText(".run");
  await expect(page.getByRole("button", { name: /Prepare for offline use/ })).toBeVisible();
  await page.getByTestId("nav-general").click();
  await expect(page).toHaveURL(/section=general/);
  await page.getByTestId("nav-about").click();
  await expect(page).toHaveURL(/section=about/);
  await page.getByTestId("nav-ai").click();
  await expect(page).toHaveURL(/section=ai/);
});

test("the About section shows app info, links, update controls, and supports deep linking", async ({
  page,
  request,
}) => {
  await page.goto("/settings?section=about");
  await expect(page.getByRole("heading", { name: "About", exact: true })).toBeVisible();
  await expect(page.getByTestId("app-version")).toContainText("development build");

  const sourceLink = page.getByRole("link", { name: "https://github.com/Fankrits/SomeScript" });
  await expect(sourceLink).toHaveAttribute("href", "https://github.com/Fankrits/SomeScript");
  const websiteLink = page.getByRole("link", { name: "https://somescript.com" });
  await expect(websiteLink).toHaveAttribute("href", "https://somescript.com");
  const issuesLink = page.getByRole("link", {
    name: "https://github.com/Fankrits/SomeScript/issues",
  });
  await expect(issuesLink).toHaveAttribute("href", "https://github.com/Fankrits/SomeScript/issues");

  const checkBtn = page.getByTestId("check-updates");
  await expect(checkBtn).toBeDisabled();
  await expect(page.getByText("Updates are only available in the desktop app")).toBeVisible();

  await page.getByTestId("nav-general").click();
  await expect(page).toHaveURL(/section=general/);
  await page.getByTestId("nav-about").click();
  await expect(page).toHaveURL(/section=about/);

  const autoUpdateSwitch = page.getByTestId("auto-update");
  await expect(autoUpdateSwitch).toHaveAttribute("data-state", "checked");
  await autoUpdateSwitch.click();
  await expect(autoUpdateSwitch).toHaveAttribute("data-state", "unchecked");
  const settingsAfterToggle = await request.get("/api/settings").then((r) => r.json());
  expect(settingsAfterToggle.autoUpdate).toBe(false);
  await page.reload();
  await expect(page.getByTestId("auto-update")).toHaveAttribute("data-state", "unchecked");
  const settingsAfterReload = await request.get("/api/settings").then((r) => r.json());
  expect(settingsAfterReload.autoUpdate).toBe(false);
  await page.getByTestId("auto-update").click();
  await expect(page.getByTestId("auto-update")).toHaveAttribute("data-state", "checked");
  const settingsAfterReenable = await request.get("/api/settings").then((r) => r.json());
  expect(settingsAfterReenable.autoUpdate).toBe(true);
});

test("Back never follows a `from` that points outside the app", async ({ page, baseURL }) => {
  for (const from of [
    "/\\evil.example",
    "//evil.example",
    "https://evil.example/",
    "/\t/evil.example",
  ]) {
    await page.goto(`/settings?section=ai&from=${encodeURIComponent(from)}`);
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    // Still on the app's own origin (the Rust server, or the Vite dev server in the dev-flow config).
    expect(new URL(page.url()).origin).toBe(new URL(baseURL!).origin);
  }
});
