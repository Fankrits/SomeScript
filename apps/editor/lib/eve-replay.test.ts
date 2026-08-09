import { expect, test } from "bun:test";
import { EveAgentStore, defaultMessageReducer } from "eve/client";
import type { MessageStreamEvent } from "eve/client";

/**
 * Pins the two halves of eve's rehydration contract that use-eve-runtime.ts is
 * built on. They pull in opposite directions, which is the whole point.
 *
 * `useEveAgent({ initialEvents })` does not start empty and fill up: the store
 * admits the whole saved log in its constructor, so the very first snapshot
 * already carries every event and every message of the restored thread.
 * Anything reading a *snapshot* as "what just happened" therefore replays the
 * entire thread on mount — which re-opened the last file Eve had written and
 * pushed a stale Tectonic log into the terminal on every reload, thread switch
 * and mode switch. Hence `toolsHydrated`.
 *
 * `onEvent`, by contrast, is attached after construction and only ever fires
 * for events eve has not already admitted — "onEvent only fires for events
 * your UI has not seen" (docs/guides/frontend/overview.mdx). That makes it
 * exactly-once for new events with no bookkeeping, which is why credit billing
 * lives there instead of scanning `agent.events`.
 *
 * If the first test fails because the counts are 0, `toolsHydrated` can go. If
 * the second fails, billing is double-charging on every remount.
 */

const SESSION_ID = "session_1";
const TURN_ID = "turn_1";

// `meta.id` is what eve dedupes on — `admit()` waves through any event that
// lacks one, so a fixture without it would pass the first test for the wrong
// reason.
const savedEvents = [
  {
    meta: { at: "2026-08-09T09:15:00.589Z", id: "evt_1" },
    type: "message.completed",
    data: {
      createdAt: 1,
      finishReason: "stop",
      message: "an answer from a turn that finished before this mount",
      messageId: "msg_1",
      sessionId: SESSION_ID,
      stepIndex: 0,
      turnId: TURN_ID,
    },
  },
  {
    meta: { at: "2026-08-09T09:15:00.590Z", id: "evt_2" },
    type: "step.completed",
    data: {
      createdAt: 2,
      finishReason: "stop",
      modelId: "test-model",
      sessionId: SESSION_ID,
      stepIndex: 0,
      turnId: TURN_ID,
      usage: { costUsd: 0.01, inputTokens: 17_972, outputTokens: 3_000 },
    },
  },
] as unknown as MessageStreamEvent[];

test("eve seeds the first snapshot with the entire replayed history", () => {
  const store = new EveAgentStore({
    initialEvents: savedEvents,
    reducer: defaultMessageReducer(),
  });

  // The tool/compile mirror reads `data.messages`, which is already populated
  // before a single render — as is `events`, which the old billing scan read.
  expect(store.snapshot.events).toHaveLength(savedEvents.length);
  expect(store.snapshot.data.messages.length).toBeGreaterThan(0);
  expect(store.snapshot.status).toBe("ready");
});

test("onEvent stays silent for the replayed history", () => {
  const store = new EveAgentStore({
    initialEvents: savedEvents,
    reducer: defaultMessageReducer(),
  });

  // Callbacks are attached after construction — the same order useEveAgent
  // uses, since setCallbacks runs during render. Nothing already admitted can
  // reach them, so a `step.completed` handler that bills is safe to run
  // unguarded on mount.
  const seen: string[] = [];
  store.setCallbacks({ onEvent: (event) => seen.push(event.type) });

  expect(seen).toEqual([]);
  expect(store.snapshot.events).toHaveLength(savedEvents.length);
});

test("a saved log that overlaps the replayed prefix is admitted once", () => {
  // What lets collapseAppendedRuns hand back a shortened log without
  // double-rendering, and what the resume path relies on when a reconnect
  // replays events the saved blob already contains.
  const store = new EveAgentStore({
    initialEvents: [...savedEvents, ...savedEvents],
    reducer: defaultMessageReducer(),
  });

  expect(store.snapshot.events).toHaveLength(savedEvents.length);
});
