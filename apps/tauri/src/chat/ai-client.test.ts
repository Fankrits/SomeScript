// The thin clients: what they send and how they surface the server's answers. The Rust side of
// the same contract is tested in src-tauri/src/api/http_tests.rs (ai_routes).
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  deleteProvider,
  getAiSettings,
  saveProvider,
  setAiPreferences,
  settingsUrl,
  startChat,
  testProvider,
} from "./api";
import { activeChoice } from "./use-ai-settings";
import {
  deleteThread,
  fetchThreadIndex,
  fetchThreadSnapshot,
  saveThreadIndex,
  saveThreadSnapshot,
} from "../shims/eve-threads-client";
import { PRESETS, presetFor } from "../settings/presets";

interface Call {
  url: string;
  method: string;
  body: unknown;
}
const calls: Call[] = [];
let respond: (call: Call) => { status?: number; json: unknown } = () => ({ json: {} });
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls.length = 0;
  respond = () => ({ json: {} });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    };
    calls.push(call);
    const { status = 200, json } = respond(call);
    return new Response(JSON.stringify(json), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("AI settings client", () => {
  test("talks to the documented routes with the documented bodies", async () => {
    await getAiSettings();
    await saveProvider({ name: "A", kind: "openai", baseUrl: "https://x/v1", apiKey: "sk-1" });
    await deleteProvider("p1");
    await setAiPreferences({ activeProviderId: "p1", activeModel: "m" });
    await testProvider({ name: "A", kind: "openai", baseUrl: "https://x/v1" }, "chat", "gpt-4.1");

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/ai/settings",
      "POST /api/ai/providers",
      "POST /api/ai/providers/delete",
      "POST /api/ai/settings",
      "POST /api/ai/providers/test",
    ]);
    expect(calls[1].body).toEqual({
      name: "A",
      kind: "openai",
      baseUrl: "https://x/v1",
      apiKey: "sk-1",
    });
    expect(calls[2].body).toEqual({ id: "p1" });
    expect(calls[3].body).toEqual({ activeProviderId: "p1", activeModel: "m" });
    expect(calls[4].body).toMatchObject({
      mode: "chat",
      model: "gpt-4.1",
      baseUrl: "https://x/v1",
    });
  });

  test("a server error becomes an Error carrying the server's own message", async () => {
    respond = () => ({
      status: 400,
      json: { error: "Base URL must start with http:// or https://" },
    });
    await expect(saveProvider({ name: "A", kind: "openai", baseUrl: "ftp://x" })).rejects.toThrow(
      "Base URL must start with http:// or https://",
    );
    respond = () => ({ status: 502, json: {} });
    await expect(getAiSettings()).rejects.toThrow("Request failed (502)");
  });

  test("startChat returns the stream, and rejects with the server's reason when there is none", async () => {
    globalThis.fetch = (async () =>
      new Response("{}\n", { status: 200 })) as unknown as typeof fetch;
    const stream = await startChat({ projectId: "p", messages: [] }, new AbortController().signal);
    expect(stream).toBeInstanceOf(ReadableStream);

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "No AI provider is set up yet." }), {
        status: 400,
      })) as unknown as typeof fetch;
    await expect(
      startChat({ projectId: "p", messages: [] }, new AbortController().signal),
    ).rejects.toThrow("No AI provider is set up yet.");
  });
});

describe("chat history client", () => {
  test("index and snapshot round trips use /api/chat and encode ids", async () => {
    respond = (c) =>
      c.url.startsWith("/api/chat/threads")
        ? { json: { index: { threads: [], activeThreadId: "" } } }
        : { json: { snapshot: { version: 1, messages: [] } } };
    expect(await fetchThreadIndex("My Thesis")).toEqual({ threads: [], activeThreadId: "" });
    expect(await fetchThreadSnapshot("My Thesis", "t/1")).toEqual({ version: 1, messages: [] });
    expect(calls[0].url).toBe("/api/chat/threads?projectId=My%20Thesis");
    expect(calls[1].url).toBe("/api/chat/thread?projectId=My%20Thesis&threadId=t%2F1");

    expect(await saveThreadIndex("p", { threads: [], activeThreadId: "" })).toBe(true);
    expect(await saveThreadSnapshot("p", "t", [{ role: "user", text: "hi" }], null)).toBe(true);
    expect(await deleteThread("p", "t")).toBe(true);
    expect(calls.slice(2).map((c) => `${c.method} ${c.url}`)).toEqual([
      "PUT /api/chat/threads",
      "PUT /api/chat/thread",
      "DELETE /api/chat/thread?projectId=p&threadId=t",
    ]);
    expect(calls[3].body).toEqual({
      projectId: "p",
      threadId: "t",
      messages: [{ role: "user", text: "hi" }],
    });
  });

  test("saves report failure with false instead of throwing (the UI keeps working)", async () => {
    respond = () => ({ status: 500, json: { error: "disk full" } });
    const quiet = console.error;
    console.error = () => {};
    try {
      expect(await saveThreadSnapshot("p", "t", [])).toBe(false);
      expect(await saveThreadIndex("p", { threads: [], activeThreadId: "" })).toBe(false);
      expect(await deleteThread("p", "t")).toBe(false);
    } finally {
      console.error = quiet;
    }
  });
});

describe("activeChoice", () => {
  const settings = {
    providers: [
      {
        id: "a",
        name: "A",
        kind: "openai",
        baseUrl: "",
        hasKey: true,
        keyHint: "",
        apiKeyHeader: "",
        models: ["a1", "a2"],
        defaultModel: "a2",
      },
      {
        id: "b",
        name: "B",
        kind: "anthropic",
        baseUrl: "",
        hasKey: false,
        keyHint: "",
        apiKeyHeader: "",
        models: ["b1"],
        defaultModel: "",
      },
    ],
    activeProviderId: null,
    activeModel: null,
    customInstructions: "",
  } as const;

  test("mirrors the server's resolve(): saved choice, else the first provider's default model", () => {
    expect(activeChoice(null)).toBeNull();
    expect(activeChoice({ ...settings, providers: [] } as never)).toBeNull();
    expect(activeChoice(settings as never)).toEqual({ name: "A", model: "a2" });
    expect(activeChoice({ ...settings, activeProviderId: "b" } as never)).toEqual({
      name: "B",
      model: "b1",
    });
    expect(
      activeChoice({ ...settings, activeProviderId: "a", activeModel: "a1" } as never),
    ).toEqual({ name: "A", model: "a1" });
    // A saved model belongs to the saved provider only.
    expect(
      activeChoice({ ...settings, activeProviderId: "ghost", activeModel: "zzz" } as never),
    ).toEqual({ name: "A", model: "a2" });
  });
});

describe("presets and the settings link", () => {
  test("every preset is usable as a starting point", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRESETS) {
      expect(["openai", "anthropic"]).toContain(p.kind);
      if (p.id !== "custom") expect(p.baseUrl).toMatch(/^https?:\/\//);
      if (p.needsKey) expect(p.baseUrl.startsWith("https://")).toBe(true);
      expect(p.baseUrl.endsWith("/")).toBe(false);
    }
    expect(ids).toContain("custom");
    expect(ids).toContain("vercel");
    expect(ids).toContain("ollama-cloud");
    // Local servers need no key.
    expect(PRESETS.find((p) => p.id === "ollama")?.needsKey).toBe(false);
    expect(PRESETS.find((p) => p.id === "vercel")?.needsKey).toBe(true);
    expect(PRESETS.find((p) => p.id === "ollama-cloud")?.needsKey).toBe(true);
  });

  test("presetFor recognises a saved provider by its base URL", () => {
    expect(presetFor("https://api.openai.com/v1/")?.id).toBe("openai");
    expect(presetFor("https://ai-gateway.vercel.sh/v1")?.id).toBe("vercel");
    expect(presetFor("https://ollama.com/v1")?.id).toBe("ollama-cloud");
    expect(presetFor("https://my.gateway.example/v1")).toBeUndefined();
  });

  test("settingsUrl remembers the page to come back to", () => {
    (globalThis as { window?: unknown }).window = {
      location: { pathname: "/", search: "?projectId=My%20Paper" },
    };
    expect(settingsUrl()).toBe("/settings?section=ai&from=%2F%3FprojectId%3DMy%2520Paper");
    (globalThis as { window?: unknown }).window = {
      location: { pathname: "/settings", search: "?section=ai" },
    };
    expect(settingsUrl("general")).toBe("/settings?section=general");
    delete (globalThis as { window?: unknown }).window;
  });
});
