import {
  DEFAULT_KEY,
  ask,
  expect,
  openChat,
  openEditor,
  sidebarTab,
  test,
  testKey,
  typeInEditor,
  waitForTurnEnd,
} from "./fixtures";

// "good" in a key makes the scripted provider accept it where it would otherwise answer 401.
const SECRET = testKey("secret", "9999");
const GOOD = testKey("good", "0000");
const BETA = testKey("beta", "2222");
const ANT = testKey("ant", "0000");

const TOOLS = [
  "list_files",
  "read_file",
  "grep",
  "edit_file",
  "write_file",
  "delete_file",
  "move_file",
  "compile_project",
  "todo_write",
];

test("without a provider the chat explains how to connect one, and Settings leads back to the editor", async ({
  page,
  project,
  provider,
  api,
}) => {
  await openEditor(page, project);
  await openChat(page);
  await expect(page.getByTestId("chat-setup")).toContainText("Connect an AI provider");
  await expect(page.getByTestId("chat-input")).toBeDisabled();

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page).toHaveURL(/\/settings\?section=ai&from=/);
  await api.addProvider({ baseUrl: provider.openai });
  await page.reload();
  await expect(page.getByTestId("provider-Mock")).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(new RegExp(`projectId=${project.id}`));
  await openChat(page);
  await expect(page.getByTestId("chat-welcome")).toBeVisible();
  await expect(page.getByTestId("chat-input")).toBeEnabled();
});

test("streams an answer, renders markdown, and sends the right request", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai, apiKey: DEFAULT_KEY });
  await openEditor(page, project);
  await openChat(page);
  await expect(page.getByTestId("model-picker")).toContainText("Mock · mock-small");

  await ask(page, "hello there");
  const answer = page.getByTestId("assistant-text");
  await expect(answer).toContainText("Sure! Here is markdown and a list");
  await expect(answer.locator("strong, [data-streamdown='strong']")).toHaveText("markdown");
  await expect(answer.locator("li")).toHaveCount(2);
  await waitForTurnEnd(page);
  await expect(page.getByTestId("user-message")).toHaveText("hello there");

  const req = provider.chatRequests().at(-1)!;
  expect(req.path).toBe("/v1/chat/completions");
  expect(req.headers.authorization).toBe(`Bearer ${DEFAULT_KEY}`);
  expect(req.body.model).toBe("mock-small");
  expect(req.body.stream).toBe(true);
  expect(req.body.tools.map((t: any) => t.function.name)).toEqual(TOOLS);
  expect(req.body.messages[0].role).toBe("system");
  expect(req.body.messages[0].content).toContain("[openFile: main.tex]");
  expect(req.body.messages.at(-1)).toEqual({ role: "user", content: "hello there" });
});

test("Shift+Enter writes a new line, Enter sends, and an empty message does not send", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  const input = page.getByTestId("chat-input");
  await expect(page.getByTestId("chat-send")).toBeDisabled();
  await input.fill("first line");
  await input.press("Shift+Enter");
  await input.pressSequentially("second line");
  await expect(input).toHaveValue("first line\nsecond line");
  await input.press("Enter");
  await expect(page.getByTestId("user-message")).toContainText("second line");
  await waitForTurnEnd(page);
  expect(provider.chatRequests().at(-1)!.body.messages.at(-1).content).toBe(
    "first line\nsecond line",
  );
  await expect(input).toHaveValue("");
});

test("edits a file through tool calls, shows a diff, updates the editor, and Undo puts it back", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "please edit the greeting");

  const read = page.getByTestId("tool-read_file");
  const edit = page.getByTestId("tool-edit_file");
  await expect(read).toContainText("Read main.tex");
  await expect(edit).toContainText("Edited main.tex");
  await waitForTurnEnd(page);
  // The diff opens by itself when the edit lands.
  await expect(edit.getByText("Hello from the mock assistant!")).toBeVisible();
  await expect(page.getByTestId("assistant-text")).toContainText("I changed the greeting in");

  expect(await api.files(project.id, "main.tex")).toContain("Hello from the mock assistant!");
  await expect(page.locator(".cm-content")).toContainText("Hello from the mock assistant!");

  // Every step was fed back to the model as a proper tool exchange.
  const calls = provider.chatRequests();
  const last = calls.at(-1)!.body.messages as any[];
  const asst = last.filter((m) => m.role === "assistant" && m.tool_calls);
  expect(asst.map((m) => m.tool_calls[0].function.name)).toEqual(["read_file", "edit_file"]);
  const results = last.filter((m) => m.role === "tool");
  expect(results[0].content).toContain("Start writing here.");
  expect(results[1].content).toBe("Edited main.tex — replaced 1 block at line 11.");
  expect(results[1].tool_call_id).toBe(asst[1].tool_calls[0].id);

  await page.getByRole("button", { name: "Undo: Edited main.tex" }).click();
  await expect.poll(() => api.files(project.id, "main.tex")).toContain("Start writing here.");
  await expect(page.locator(".cm-content")).toContainText("Start writing here.");
  await expect(edit.getByText("Undone")).toBeVisible();
});

test("Undo asks first when the file changed since the edit", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "please edit the greeting");
  await waitForTurnEnd(page);
  await expect(page.locator(".cm-content")).toContainText("Hello from the mock assistant!");

  // The user keeps typing; autosave writes it.
  await typeInEditor(page, "\nMy own sentence.");
  await expect.poll(() => api.files(project.id, "main.tex")).toContain("My own sentence.");

  await page.getByRole("button", { name: "Undo: Edited main.tex" }).click();
  await expect(page.getByText("Changed since. Undo anyway?")).toBeVisible();
  await page.getByRole("button", { name: "Keep", exact: true }).click();
  expect(await api.files(project.id, "main.tex")).toContain("My own sentence.");

  await page.getByRole("button", { name: "Undo: Edited main.tex" }).click();
  await page
    .getByTestId("tool-edit_file")
    .getByRole("button", { name: "Undo", exact: true })
    .click();
  await expect.poll(() => api.files(project.id, "main.tex")).toContain("Start writing here.");
  expect(await api.files(project.id, "main.tex")).not.toContain("My own sentence.");
});

test("unsaved typing is flushed to disk before the assistant reads the file", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await page.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type("\nJUST TYPED", { delay: 0 });
  // Ask immediately, before the 1s autosave: the assistant must still see the new line.
  await ask(page, "please edit the greeting");
  await expect(page.getByTestId("tool-read_file")).toContainText("Read main.tex");
  await waitForTurnEnd(page);
  const toolResult = (provider.chatRequests().at(-1)!.body.messages as any[]).find(
    (m) => m.role === "tool",
  ).content as string;
  expect(toolResult).toContain("JUST TYPED");
  expect(await api.files(project.id, "main.tex")).toContain("JUST TYPED");
});

test("shows the plan the assistant keeps with todo_write", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "make a plan for the intro");
  const plan = page.getByTestId("todo-list");
  await expect(plan).toContainText("Read the file");
  await expect(plan).toContainText("Write the intro");
  await expect(plan).toContainText("1/3");
  await waitForTurnEnd(page);
  await expect(page.getByTestId("assistant-text")).toContainText("Plan saved.");
});

test("searches the project with grep and list_files", async ({ page, project, provider, api }) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "search the project");
  await expect(page.getByTestId("tool-grep")).toContainText("Searched for “document”");
  await expect(page.getByTestId("tool-grep")).toContainText("3 matches");
  await expect(page.getByTestId("tool-list_files")).toContainText("Listed files");
  await waitForTurnEnd(page);
  const messages = provider.chatRequests().at(-1)!.body.messages as any[];
  const grep = messages.find((m) => m.role === "tool" && String(m.content).includes("match"));
  expect(grep.content).toContain("main.tex:");
});

test("compile_project runs the engine, refreshes the PDF preview and reports errors", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await expect(page.getByText("Click Compile to generate PDF")).toBeVisible();

  await ask(page, "compile it please");
  await expect(page.getByTestId("tool-compile_project")).toContainText("Compiled");
  await waitForTurnEnd(page);
  // The same preview the Compile button fills.
  await expect(page.getByRole("button", { name: /Download PDF/ })).toBeVisible();
  await expect(page.getByText("Click Compile to generate PDF")).toBeHidden();

  // Now break the document: the assistant gets the error and so does the card.
  await api.writeFile(
    project.id,
    "main.tex",
    "\\documentclass{article}\n% FAKE_TEX_ERROR\n\\begin{document}\\end{document}\n",
  );
  await ask(page, "compile it again");
  const card = page.getByTestId("tool-compile_project").last();
  await expect(card).toContainText("Compile failed");
  await expect(card).toContainText("Undefined control sequence");
  await waitForTurnEnd(page);
  const sent = (provider.chatRequests().at(-1)!.body.messages as any[])
    .filter((m) => m.role === "tool")
    .at(-1).content as string;
  expect(sent).toContain("Compile FAILED for main.tex");
  expect(sent).toContain("- main.tex:3: Undefined control sequence");
});

test("a rejected key is explained, retryable, and never shown", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai, apiKey: SECRET });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "this will fail");
  const banner = page.getByTestId("chat-error");
  await expect(banner).toContainText("rejected the API key (401)");
  await expect(banner.getByRole("button", { name: "Settings" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(SECRET);
  // The empty reply is not left behind as a blank bubble.
  await expect(page.getByTestId("assistant-message")).toHaveCount(0);
  await expect(page.getByTestId("user-message")).toHaveText("this will fail");

  // Fix the key (the provider re-reads settings on every turn) and retry.
  await api.addProvider({
    name: "Fixed",
    baseUrl: provider.openai,
    apiKey: GOOD,
  });
  const settings = await api.settings();
  const fixed = settings.providers.find((p: any) => p.name === "Fixed");
  await page.request.post("/api/ai/settings", {
    data: { activeProviderId: fixed.id, activeModel: "mock-small" },
  });
  await banner.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByTestId("assistant-text")).toBeVisible();
  // The first call used the rejected key, the retry the new one.
  const auth = provider.chatRequests().map((r) => r.headers.authorization);
  expect(auth[0]).toBe(`Bearer ${SECRET}`);
  expect(auth.at(-1)).toBe(`Bearer ${GOOD}`);
});

test("an error in the middle of an answer keeps what arrived and offers Retry", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "boom");
  await expect(page.getByTestId("assistant-text")).toContainText("Partial answer");
  await expect(page.getByTestId("assistant-error")).toContainText(
    "The mock model crashed mid-answer",
  );
  await expect(
    page.getByTestId("assistant-error").getByRole("button", { name: "Retry" }),
  ).toBeVisible();
  await waitForTurnEnd(page);
});

test("Stop cancels a long answer, closes the connection, and the chat keeps working", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "slow please");
  await expect(page.getByTestId("assistant-text")).toContainText("word2");
  await page.getByTestId("chat-stop").click();
  await expect(page.getByTestId("chat-stop")).toHaveCount(0);
  await expect.poll(() => provider.disconnects).toBeGreaterThan(0);

  // What arrived stays, and is part of the conversation the next question builds on.
  const partial = await page.getByTestId("assistant-text").first().innerText();
  expect(partial).toContain("word0");
  await ask(page, "hello again");
  await expect(page.getByTestId("assistant-text").last()).toContainText("markdown");
  const messages = provider.chatRequests().at(-1)!.body.messages as any[];
  expect(messages.some((m) => m.role === "assistant" && String(m.content).includes("word0"))).toBe(
    true,
  );
});

test("the model picker changes the model for the next message, and persists", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai, models: ["mock-small", "mock-large"] });
  await openEditor(page, project);
  await openChat(page);
  await page.getByTestId("model-picker").click();
  await page.getByRole("menuitem", { name: "mock-large" }).click();
  await expect(page.getByTestId("model-picker")).toContainText("mock-large");
  await ask(page, "hello");
  await waitForTurnEnd(page);
  expect(provider.chatRequests().at(-1)!.body.model).toBe("mock-large");

  await page.reload();
  await openChat(page);
  await expect(page.getByTestId("model-picker")).toContainText("mock-large");
  expect((await api.settings()).activeModel).toBe("mock-large");
});

test("with two providers the picker switches between them", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({
    name: "Alpha",
    baseUrl: provider.openai,
    apiKey: testKey("alpha", "1111"),
    models: ["a-model"],
    defaultModel: "a-model",
  });
  await api.addProvider({
    name: "Beta",
    baseUrl: provider.openai,
    apiKey: BETA,
    models: ["b-model"],
    defaultModel: "b-model",
  });
  await openEditor(page, project);
  await openChat(page);
  await expect(page.getByTestId("model-picker")).toContainText("Alpha · a-model");
  await page.getByTestId("model-picker").click();
  await page.getByRole("menuitem", { name: "b-model" }).click();
  await expect(page.getByTestId("model-picker")).toContainText("Beta · b-model");
  await ask(page, "hello");
  await waitForTurnEnd(page);
  const req = provider.chatRequests().at(-1)!;
  expect(req.headers.authorization).toBe(`Bearer ${BETA}`);
  expect(req.body.model).toBe("b-model");
});

test("the Anthropic protocol works end to end, including tool use", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({
    name: "Claude",
    kind: "anthropic",
    baseUrl: provider.url,
    apiKey: ANT,
    models: ["claude-mock"],
    defaultModel: "claude-mock",
  });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "please edit the greeting");
  await expect(page.getByTestId("tool-edit_file")).toContainText("Edited main.tex");
  await waitForTurnEnd(page);
  await expect(page.getByTestId("assistant-text")).toContainText("I changed the greeting in");
  expect(await api.files(project.id, "main.tex")).toContain("Hello from the mock assistant!");

  const first = provider.chatRequests()[0];
  expect(first.path).toBe("/v1/messages");
  expect(first.headers["x-api-key"]).toBe(ANT);
  expect(first.headers["anthropic-version"]).toBe("2023-06-01");
  expect(first.headers.authorization).toBeUndefined();
  expect(first.body.system).toContain("LaTeX");
  expect(first.body.tools.map((t: any) => t.name)).toEqual(TOOLS);
  const last = provider.chatRequests().at(-1)!.body.messages as any[];
  expect(last.at(-1).content[0].type).toBe("tool_result");
});

test("the conversation survives a reload, New Chat starts fresh, and History switches back", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "hello there");
  await waitForTurnEnd(page);
  await expect(page.getByTestId("assistant-text")).toContainText("markdown");

  await page.reload();
  await openChat(page);
  await expect(page.getByTestId("user-message")).toHaveText("hello there");
  await expect(page.getByTestId("assistant-text")).toContainText("markdown");

  await page.getByRole("button", { name: "New Chat" }).click();
  await expect(page.getByTestId("chat-welcome")).toBeVisible();
  await ask(page, "a second question");
  await waitForTurnEnd(page);

  await page.getByRole("button", { name: "History", exact: true }).click();
  await expect(page.getByText("2 chats")).toBeVisible();
  await page.getByRole("button", { name: /hello there/ }).click();
  await expect(page.getByTestId("user-message")).toHaveText("hello there");

  // The history is stored in the project folder, not in the browser.
  const saved = await page.request
    .get(`/api/chat/threads?projectId=${project.id}`)
    .then((r) => r.json());
  expect(saved.index.threads).toHaveLength(2);
});

test("a follow-up carries the earlier turns, and tool results from a previous turn", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await ask(page, "please edit the greeting");
  await waitForTurnEnd(page);
  await ask(page, "thanks, hello");
  await waitForTurnEnd(page);
  const messages = provider.chatRequests().at(-1)!.body.messages as any[];
  const roles = messages.map((m) => m.role);
  expect(roles).toEqual([
    "system",
    "user",
    "assistant",
    "tool",
    "assistant",
    "tool",
    "assistant",
    "user",
  ]);
  expect(messages.at(-1).content).toBe("thanks, hello");
});

test("text sent from elsewhere in the editor becomes an attachment chip and reaches the model", async ({
  page,
  project,
  provider,
  api,
}) => {
  await api.addProvider({ baseUrl: provider.openai });
  await openEditor(page, project);
  await openChat(page);
  await page.evaluate(() =>
    window.dispatchEvent(
      new CustomEvent("somescript:attach-to-chat", {
        detail: { name: "main.tex:3-4", text: "\\title{Untitled}" },
      }),
    ),
  );
  const chips = page.getByTestId("attachments");
  await expect(chips).toContainText("main.tex:3-4");
  await ask(page, "what is this?");
  await waitForTurnEnd(page);
  await expect(chips).toHaveCount(0);
  await expect(page.getByTestId("user-message")).toContainText("main.tex:3-4");
  const sent = provider.chatRequests().at(-1)!.body.messages.at(-1).content as string;
  expect(sent).toContain('<attachment name="main.tex:3-4">\n\\title{Untitled}\n</attachment>');
  await sidebarTab(page, "Agent").click();
});
