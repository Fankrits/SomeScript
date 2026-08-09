import { expect, test } from "bun:test";
import { filterOrphanedMessages } from "./eve-messages";
import type { EveMessage, EveMessagePart } from "eve/react";

function user(id: string, status?: "submitted" | "failed" | "complete"): EveMessage {
  return { id, role: "user", metadata: status ? { status } : undefined, parts: [] };
}
function assistant(id: string, status: "streaming" | "complete"): EveMessage {
  return { id, role: "assistant", metadata: { status }, parts: [] };
}

test("leaves a normal completed exchange untouched", () => {
  const messages = [user("q1", "complete"), assistant("a1", "complete")];
  expect(filterOrphanedMessages(messages)).toEqual(messages);
});

test("drops the abandoned turn left behind by a stall-then-retry", () => {
  // Turn 1 stalls and is aborted (failed echo + reply frozen mid-stream),
  // then silently resent as turn 2, which completes normally.
  const messages = [
    user("q1", "failed"),
    assistant("a1", "streaming"),
    user("q2", "complete"),
    assistant("a2", "complete"),
  ];
  expect(filterOrphanedMessages(messages)).toEqual([
    user("q2", "complete"),
    assistant("a2", "complete"),
  ]);
});

test("keeps the last failed question and partial reply when every retry stalls", () => {
  // Double stall: nothing ever completes, so the UI must still show what was
  // asked and the partial answer, not an empty thread.
  const messages = [
    user("q1", "failed"),
    assistant("a1", "streaming"),
    user("q2", "failed"),
    assistant("a2", "streaming"),
  ];
  expect(filterOrphanedMessages(messages)).toEqual([
    user("q2", "failed"),
    assistant("a2", "streaming"),
  ]);
});

test("keeps a genuinely in-flight turn's streaming reply", () => {
  const messages = [user("q1", "complete"), assistant("a1", "streaming")];
  expect(filterOrphanedMessages(messages)).toEqual(messages);
});

function text(stepIndex: number, body: string): EveMessagePart {
  return { type: "text", stepIndex, state: "done", text: body };
}

function reasoning(stepIndex: number, body: string): EveMessagePart {
  return { type: "reasoning", stepIndex, state: "done", text: body };
}

/** Three read-file calls at one stepIndex is routine; only runs are deduped. */
function tool(toolCallId: string): EveMessagePart {
  return {
    type: "dynamic-tool",
    toolName: "read-file",
    toolCallId,
    stepIndex: 1,
    state: "output-available",
    input: {},
    output: "…",
  };
}

function reply(parts: EveMessagePart[]): EveMessage {
  return { id: "a1", role: "assistant", metadata: { status: "complete" }, parts };
}

test("drops the discarded attempt when eve silently re-runs a step", () => {
  // turn_3 from a real diagnostics dump: two step.completed events at
  // stepIndex 1 with identical inputTokens (17972), so the reply rendered
  // twice. Only the retry — the attempt eve keeps — should survive.
  const messages = [
    user("q1", "complete"),
    reply([
      text(0, "Let me look at the rest of the section files"),
      reasoning(1, "first attempt reasoning"),
      text(1, "I've now read the whole project, and I can see exactly why"),
      reasoning(1, "retry reasoning"),
      text(1, "I've now read the whole project. I can see a clear structural problem"),
    ]),
  ];
  expect(filterOrphanedMessages(messages)).toEqual([
    user("q1", "complete"),
    reply([
      text(0, "Let me look at the rest of the section files"),
      reasoning(1, "retry reasoning"),
      text(1, "I've now read the whole project. I can see a clear structural problem"),
    ]),
  ]);
});

test("leaves a healthy multi-step reply untouched", () => {
  // One run per type per step is the normal shape, so this must not filter.
  const messages = [
    user("q1", "complete"),
    reply([
      reasoning(0, "step 0 thinking"),
      text(0, "step 0 reply"),
      text(1, "step 1 reply"),
      text(2, "step 2 reply"),
    ]),
  ];
  expect(filterOrphanedMessages(messages)).toEqual(messages);
});

test("keeps tool parts that repeat within one step", () => {
  const messages = [user("q1", "complete"), reply([tool("c1"), tool("c2"), tool("c3")])];
  expect(filterOrphanedMessages(messages)).toEqual(messages);
});
