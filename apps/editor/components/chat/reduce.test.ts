import { describe, expect, test } from "bun:test";
import { applyEvent, latestTodos, sanitizeMessages, settle, titleFrom } from "./reduce";
import type { AssistantMessage, AssistantPart, ChatEvent, ChatMessage } from "./types";

const blank = (id = "1"): AssistantMessage => ({
  id,
  role: "assistant",
  parts: [],
  running: true,
});

describe("applyEvent", () => {
  test("text deltas build one paragraph, and a tool call splits the text around it", () => {
    let m = blank();
    m = applyEvent(m, { type: "text", delta: "Hello" });
    m = applyEvent(m, { type: "text", delta: " world" });
    expect(m.parts).toEqual([{ type: "text", text: "Hello world" }]);

    m = applyEvent(m, {
      type: "tool-call",
      id: "c1",
      name: "read_file",
      args: { path: "main.tex" },
    });
    expect(m.parts).toHaveLength(2);
    expect(m.parts[1]).toMatchObject({
      type: "tool",
      id: "c1",
      name: "read_file",
      status: "running",
    });

    m = applyEvent(m, { type: "text", delta: "Second paragraph" });
    expect(m.parts).toHaveLength(3);
    expect(m.parts[2]).toEqual({ type: "text", text: "Second paragraph" });
  });

  test("reasoning is kept apart from the answer", () => {
    let m = blank();
    m = applyEvent(m, { type: "reasoning", delta: "Thinking..." });
    m = applyEvent(m, { type: "reasoning", delta: " done." });
    m = applyEvent(m, { type: "text", delta: "The answer." });
    expect(m.parts).toEqual([
      { type: "reasoning", text: "Thinking... done." },
      { type: "text", text: "The answer." },
    ]);
  });

  test("a tool call goes running -> done with its result, and a failure marks it error", () => {
    let m = blank();
    m = applyEvent(m, { type: "tool-call", id: "c1", name: "t", args: {} });
    m = applyEvent(m, {
      type: "tool-result",
      id: "c1",
      ok: true,
      result: { ok: true, count: 3 },
      output: "3",
    });
    expect(m.parts[0]).toMatchObject({ status: "done", output: "3", result: { ok: true, count: 3 } });

    m = applyEvent(m, { type: "tool-call", id: "c2", name: "t", args: {} });
    m = applyEvent(m, {
      type: "tool-result",
      id: "c2",
      ok: false,
      result: { ok: false, error: "denied" },
      output: "denied",
    });
    expect(m.parts[1]).toMatchObject({ status: "error", output: "denied" });
  });

  test("notices become parts and errors are recorded on the message", () => {
    let m = blank();
    m = applyEvent(m, { type: "notice", message: "Notice text" });
    m = applyEvent(m, { type: "error", message: "Model timeout" });
    expect(m.parts).toEqual([{ type: "notice", text: "Notice text" }]);
    expect(m.error).toBe("Model timeout");
  });
});

describe("settle", () => {
  test("stops the spinner and marks tools that never answered as stopped", () => {
    const m: AssistantMessage = {
      id: "1",
      role: "assistant",
      running: true,
      parts: [
        { type: "tool", id: "c1", name: "t", args: {}, status: "running" },
        { type: "tool", id: "c2", name: "t", args: {}, status: "done" },
      ],
    };
    const s = settle(m);
    expect(s.running).toBe(false);
    expect(s.parts[0]).toMatchObject({ status: "stopped" });
    expect(s.parts[1]).toMatchObject({ status: "done" });
  });
});

describe("sanitizeMessages", () => {
  test("keeps well-formed messages and drops everything else", () => {
    const raw = [
      null,
      "hello",
      { role: "user", text: "Question", id: "u1" },
      { role: "assistant", id: "a1", parts: [{ type: "text", text: "Answer" }] },
      { role: "unknown" },
    ];
    const clean = sanitizeMessages(raw);
    expect(clean).toHaveLength(2);
    expect(clean[0]).toEqual({ id: "u1", role: "user", text: "Question" });
    expect(clean[1].role).toBe("assistant");
  });
});

describe("latestTodos", () => {
  test("returns the newest plan", () => {
    const parts: AssistantPart[] = [
      {
        type: "tool",
        id: "1",
        name: "todo",
        args: {},
        status: "done",
        result: { ok: true, todos: [{ content: "First", status: "completed" }] },
      },
      {
        type: "tool",
        id: "2",
        name: "todo",
        args: {},
        status: "done",
        result: { ok: true, todos: [{ content: "Second", status: "pending" }] },
      },
    ];
    expect(latestTodos(parts)).toEqual([{ content: "Second", status: "pending" }]);
  });
});

describe("titleFrom", () => {
  test("collapses whitespace and shortens long questions", () => {
    expect(titleFrom("   hello \n  world   ")).toBe("hello world");
    expect(
      titleFrom(
        "A very long prompt that goes on and on and on and exceeds the forty-eight character threshold by far",
      ),
    ).toHaveLength(48);
  });
});
