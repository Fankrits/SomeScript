import { describe, expect, test } from "bun:test";
import { applyEvent, latestTodos, sanitizeMessages, settle, titleFrom } from "./reduce";
import type { AssistantMessage, ChatEvent, ChatMessage, ToolPart } from "./types";

const fresh = (): AssistantMessage => ({ id: "a1", role: "assistant", parts: [], running: true });
const fold = (events: ChatEvent[], from = fresh()) => events.reduce(applyEvent, from);

describe("applyEvent", () => {
  test("text deltas build one paragraph, and a tool call splits the text around it", () => {
    const msg = fold([
      { type: "start", provider: "OpenAI", model: "gpt-4.1" },
      { type: "text", delta: "Let me " },
      { type: "text", delta: "look." },
      { type: "tool-call", id: "c1", name: "read_file", args: { path: "main.tex" } },
      { type: "text", delta: "Found " },
      { type: "text", delta: "it." },
    ]);
    expect(msg.provider).toBe("OpenAI");
    expect(msg.model).toBe("gpt-4.1");
    expect(msg.parts.map((p) => p.type)).toEqual(["text", "tool", "text"]);
    expect(msg.parts[0]).toEqual({ type: "text", text: "Let me look." });
    expect(msg.parts[2]).toEqual({ type: "text", text: "Found it." });
  });

  test("reasoning is kept apart from the answer", () => {
    const msg = fold([
      { type: "reasoning", delta: "hm" },
      { type: "reasoning", delta: "m" },
      { type: "text", delta: "Answer" },
    ]);
    expect(msg.parts).toEqual([
      { type: "reasoning", text: "hmm" },
      { type: "text", text: "Answer" },
    ]);
  });

  test("a tool call goes running -> done with its result, and a failure marks it error", () => {
    const running = fold([
      { type: "tool-call", id: "c1", name: "edit_file", args: { path: "a.tex" } },
    ]);
    expect((running.parts[0] as ToolPart).status).toBe("running");

    const done = applyEvent(running, {
      type: "tool-result",
      id: "c1",
      ok: true,
      result: { ok: true, path: "a.tex", before: "x", after: "y" },
      output: "Edited a.tex — replaced 1 block at line 1.",
    });
    const part = done.parts[0] as ToolPart;
    expect(part.status).toBe("done");
    expect(part.output).toContain("Edited a.tex");
    expect(part.result?.after).toBe("y");

    const failed = applyEvent(running, {
      type: "tool-result",
      id: "c1",
      ok: false,
      result: { ok: false, error: "nope" },
      output: "Error: nope",
    });
    expect((failed.parts[0] as ToolPart).status).toBe("error");
  });

  test("remembers which model step issued a tool call", () => {
    const msg = fold([
      { type: "tool-call", id: "c1", name: "read_file", args: {}, step: 1 },
      { type: "tool-call", id: "c2", name: "edit_file", args: {}, step: 2 },
      { type: "tool-call", id: "c3", name: "grep", args: {} },
    ]);
    expect(msg.parts.map((p) => (p as ToolPart).step)).toEqual([1, 2, undefined]);
  });

  test("a result for an unknown call changes nothing", () => {
    const msg = fold([{ type: "text", delta: "hi" }]);
    expect(
      applyEvent(msg, {
        type: "tool-result",
        id: "ghost",
        ok: true,
        result: { ok: true },
        output: "",
      }),
    ).toEqual(msg);
  });

  test("notices become parts and errors are recorded on the message", () => {
    const msg = fold([
      { type: "notice", message: "This model can't use tools." },
      { type: "text", delta: "partial" },
      { type: "error", message: "Connection lost" },
    ]);
    expect(msg.parts[0]).toEqual({ type: "notice", text: "This model can't use tools." });
    expect(msg.error).toBe("Connection lost");
    expect(msg.parts[1]).toEqual({ type: "text", text: "partial" });
  });

  test("usage and done leave the message alone", () => {
    const msg = fold([{ type: "text", delta: "x" }]);
    expect(applyEvent(msg, { type: "usage", input: 1, output: 2 })).toBe(msg);
    expect(applyEvent(msg, { type: "done", reason: "stop" })).toBe(msg);
  });

  test("never mutates the message it was given", () => {
    const before = fold([{ type: "text", delta: "a" }]);
    const snapshot = JSON.stringify(before);
    applyEvent(before, { type: "text", delta: "b" });
    applyEvent(before, { type: "tool-call", id: "c", name: "grep", args: {} });
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("settle", () => {
  test("stops the spinner and marks tools that never answered as stopped", () => {
    const msg = fold([
      { type: "tool-call", id: "c1", name: "compile_project", args: {} },
      { type: "tool-call", id: "c2", name: "grep", args: {} },
      { type: "tool-result", id: "c2", ok: true, result: { ok: true }, output: "none" },
    ]);
    const settled = settle(msg);
    expect(settled.running).toBe(false);
    expect(settled.parts.map((p) => (p as ToolPart).status)).toEqual(["stopped", "done"]);
  });
});

describe("sanitizeMessages", () => {
  test("keeps well-formed messages and drops everything else", () => {
    const out = sanitizeMessages([
      { id: "u1", role: "user", text: "hi", attachments: [{ name: "a", text: "b" }, { name: 1 }] },
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "text", text: "yo" }, { type: "bogus" }, null],
      },
      { role: "user", text: 5 },
      "junk",
      null,
      { role: "system", text: "x" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      id: "u1",
      role: "user",
      text: "hi",
      attachments: [{ name: "a", text: "b" }],
    });
    expect((out[1] as AssistantMessage).parts).toEqual([{ type: "text", text: "yo" }]);
    expect(sanitizeMessages("nope")).toEqual([]);
    expect(sanitizeMessages(undefined)).toEqual([]);
  });

  test("a conversation saved mid-run comes back settled, never spinning", () => {
    const saved: ChatMessage[] = [
      {
        id: "a",
        role: "assistant",
        running: true,
        parts: [{ type: "tool", id: "c", name: "grep", args: {}, status: "running" }],
      },
    ];
    const [m] = sanitizeMessages(JSON.parse(JSON.stringify(saved)));
    expect((m as AssistantMessage).running).toBeFalsy();
    expect(((m as AssistantMessage).parts[0] as ToolPart).status).toBe("stopped");
  });

  test("ids are created when a saved message has none", () => {
    const [m] = sanitizeMessages([{ role: "user", text: "hi" }]);
    expect(m.id.length).toBeGreaterThan(10);
  });
});

describe("latestTodos", () => {
  const todoPart = (id: string, content: string): ToolPart => ({
    type: "tool",
    id,
    name: "todo_write",
    args: {},
    status: "done",
    result: { ok: true, todos: [{ content, status: "pending" }] },
  });

  test("returns the newest plan", () => {
    expect(
      latestTodos([todoPart("1", "first"), { type: "text", text: "x" }, todoPart("2", "second")]),
    ).toEqual([{ content: "second", status: "pending" }]);
  });

  test("is null without a successful plan", () => {
    expect(latestTodos([])).toBeNull();
    expect(
      latestTodos([{ ...todoPart("1", "x"), result: { ok: false, error: "bad" } } as ToolPart]),
    ).toBeNull();
  });
});

describe("titleFrom", () => {
  test("collapses whitespace and shortens long questions", () => {
    expect(titleFrom("  fix\n\n the   bibliography ")).toBe("fix the bibliography");
    const long = titleFrom("x".repeat(100));
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long.endsWith("…")).toBe(true);
    expect(titleFrom("   ")).toBe("New Chat");
  });
});
