import { expect, test } from "bun:test";
import { defaultMessageReducer } from "eve/client";
import type { MessageStreamEvent } from "eve/client";
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

/**
 * The real eve reducer, driven with the events a HITL question actually
 * produces, so what this pins is eve's projection and not our idea of it.
 *
 * The shape that matters: in `conversation` mode eve *completes* the parked
 * turn — `emitTurnEpilogue` in harness/tool-loop.js emits turn.completed then
 * session.waiting at the park — so answering starts a *new* turn with its own
 * assistant message, and the answered one is no longer the last.
 */
function projectHitlExchange() {
  const reducer = defaultMessageReducer();
  const parked = [
    { type: "turn.started", data: { sequence: 0, turnId: "turn_0" } },
    {
      type: "message.received",
      data: { message: "make the intro shorter", sequence: 0, turnId: "turn_0" },
    },
    { type: "step.started", data: { modelId: "m", sequence: 0, stepIndex: 0, turnId: "turn_0" } },
    {
      type: "message.completed",
      data: {
        finishReason: "tool-calls",
        message: "I can trim it two ways.",
        sequence: 0,
        stepIndex: 0,
        turnId: "turn_0",
      },
    },
    {
      type: "input.requested",
      data: {
        requests: [
          {
            requestId: "req_1",
            kind: "question",
            prompt: "Which one?",
            options: [
              { id: "a", label: "Tighten" },
              { id: "b", label: "Rewrite" },
            ],
            action: {
              kind: "tool-call",
              callId: "call_1",
              toolName: "ask_question",
              input: { prompt: "Which one?" },
            },
          },
        ],
        sequence: 0,
        stepIndex: 0,
        turnId: "turn_0",
      },
    },
    { type: "turn.completed", data: { sequence: 0, turnId: "turn_0" } },
    { type: "session.waiting", data: {} },
  ] as unknown as MessageStreamEvent[];

  // The answer itself is a client-side projection event: it never appears in
  // `agent.events`, which is why a reload shows the message the UI just lost.
  const answer = {
    type: "client.input.responded",
    data: { createdAt: 0, responses: [{ requestId: "req_1", optionId: "a" }] },
  } as unknown as MessageStreamEvent;

  const resumed = [
    { type: "turn.started", data: { sequence: 1, turnId: "turn_1" } },
    { type: "step.started", data: { modelId: "m", sequence: 1, stepIndex: 0, turnId: "turn_1" } },
    {
      type: "message.appended",
      data: {
        messageDelta: "Tightening it now.",
        messageSoFar: "Tightening it now.",
        sequence: 1,
        stepIndex: 0,
        turnId: "turn_1",
      },
    },
  ] as unknown as MessageStreamEvent[];

  let data = reducer.initial();
  for (const event of [...parked, answer, ...resumed]) data = reducer.reduce(data, event);
  return { events: [...parked, ...resumed], messages: data.messages as EveMessage[] };
}

test("keeps the answered turn's reply when a HITL question resumes into a new turn", () => {
  const { events, messages } = projectHitlExchange();

  expect(filterOrphanedMessages(messages, events).map((m) => m.id)).toEqual([
    "turn_0:user",
    "turn_0:assistant",
    "turn_1:assistant",
  ]);
});
