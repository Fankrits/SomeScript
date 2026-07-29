import { expect, test } from "bun:test";
import { filterOrphanedMessages } from "./eve-messages";
import type { EveMessage } from "eve/react";

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
