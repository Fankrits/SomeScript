import { expect, test } from "bun:test";
import { capOversizedPayloads, collapseAppendedRuns } from "./thread-history";

// --- collapseAppendedRuns -------------------------------------------------

/** One streamed reply as eve emits it: every event carries the full text so far. */
const appendedRun = (turnId: string, stepIndex: number, chunks: string[]) =>
  chunks.map((_, i) => ({
    type: "message.appended",
    data: { turnId, stepIndex, messageSoFar: chunks.slice(0, i + 1).join("") },
  }));

test("collapses a streaming run to its final event, keeping the full text", () => {
  const events = collapseAppendedRuns(appendedRun("t1", 0, ["Hel", "lo ", "there"]));
  expect(events).toHaveLength(1);
  expect((events[0] as { data: { messageSoFar: string } }).data.messageSoFar).toBe("Hello there");
});

test("keeps runs from different turns, steps, and event types apart", () => {
  const events = collapseAppendedRuns([
    ...appendedRun("t1", 0, ["a", "b"]),
    { type: "reasoning.appended", data: { turnId: "t1", stepIndex: 0, reasoningSoFar: "why" } },
    ...appendedRun("t1", 1, ["c", "d"]),
    ...appendedRun("t2", 0, ["e", "f"]),
  ]);
  // One survivor per (type, turnId, stepIndex) — four runs in, four out.
  expect(events).toHaveLength(4);
});

test("preserves every non-appended event, in order", () => {
  const events = collapseAppendedRuns([
    { type: "step.started", data: { turnId: "t1", stepIndex: 0 } },
    ...appendedRun("t1", 0, ["a", "b", "c"]),
    { type: "message.completed", data: { turnId: "t1", stepIndex: 0, message: "abc" } },
    { type: "turn.completed", data: { turnId: "t1" } },
  ]);
  expect(events.map((e) => (e as { type: string }).type)).toEqual([
    "step.started",
    "message.appended",
    "message.completed",
    "turn.completed",
  ]);
});

test("keeps a mid-stream partial when the turn was abandoned before completing", () => {
  // No message.completed: the last appended event is the only copy of the text.
  const events = collapseAppendedRuns(appendedRun("t1", 0, ["par", "tial"]));
  expect((events[0] as { data: { messageSoFar: string } }).data.messageSoFar).toBe("partial");
});

test("a long reply collapses to a small fraction of its uncollapsed size", () => {
  // 600 chunks of 34 chars ~= 20 KB of visible text, which serialized
  // uncollapsed grows quadratically with chunk count.
  const chunks = Array.from({ length: 600 }, () => "x".repeat(34));
  const raw = appendedRun("t1", 0, chunks);
  expect(JSON.stringify(raw).length).toBeGreaterThan(5_000_000);
  expect(JSON.stringify(collapseAppendedRuns(raw)).length).toBeLessThan(100_000);
});

// --- capOversizedPayloads --------------------------------------------------

test("caps a string leaf over the limit, noting its original length", () => {
  const events = [{ type: "action.result", data: { result: { output: "x".repeat(300_000) } } }];
  const [capped] = capOversizedPayloads(events) as [{ data: { result: { output: string } } }];
  expect(capped.data.result.output.length).toBeLessThan(300_000);
  expect(capped.data.result.output).toContain("300000 chars");
});

test("leaves strings under the limit untouched", () => {
  const events = [{ type: "action.result", data: { result: { output: "a short result" } } }];
  const [capped] = capOversizedPayloads(events) as [{ data: { result: { output: string } } }];
  expect(capped.data.result.output).toBe("a short result");
});

test("caps a long string nested inside an array, leaving short siblings alone", () => {
  const events = [
    { type: "actions.requested", data: { actions: [{ input: { path: "a.tex" } }] } },
    { type: "message.completed", data: { message: "y".repeat(300_000) } },
  ];
  const capped = capOversizedPayloads(events) as [
    { data: { actions: [{ input: { path: string } }] } },
    { data: { message: string } },
  ];
  expect(capped[0].data.actions[0].input.path).toBe("a.tex");
  expect(capped[1].data.message.length).toBeLessThan(300_000);
});

test("a huge tool result shrinks by an order of magnitude once capped", () => {
  // One read-file/compile-project result, large enough on its own that
  // transferring/storing it uncapped would be wasteful.
  const events = [
    { type: "action.result", data: { result: { callId: "1", output: "z".repeat(6_000_000) } } },
  ];
  expect(JSON.stringify(events).length).toBeGreaterThan(5_000_000);
  expect(JSON.stringify(capOversizedPayloads(events)).length).toBeLessThan(1_000_000);
});
