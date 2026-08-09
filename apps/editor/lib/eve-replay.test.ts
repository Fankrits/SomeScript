import { expect, test } from "bun:test";
import { EveAgentStore, defaultMessageReducer } from "eve/client";
import type { HandleMessageStreamEvent } from "eve/client";

/**
 * Pins the upstream behaviour three guards in use-eve-runtime.ts exist for.
 *
 * `useEveAgent({ initialEvents })` does not start empty and fill up: eve's
 * store admits the whole saved log in its constructor, so the very first
 * snapshot already carries every event and every message of the restored
 * thread. Anything that treats a snapshot as "what just happened" therefore
 * replays the entire thread on mount — which billed the workspace again for
 * every step, re-opened the last file Eve had written, and pushed a stale
 * Tectonic log into the terminal on every reload, thread switch and mode
 * switch.
 *
 * If this test ever fails because the counts are 0, eve changed and
 * `billedThrough` / `toolsHydrated` can go.
 */

const SESSION_ID = "session_1";
const TURN_ID = "turn_1";

const savedEvents = [
  {
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
] as unknown as HandleMessageStreamEvent[];

test("eve seeds the first snapshot with the entire replayed history", () => {
  const store = new EveAgentStore({
    initialEvents: savedEvents,
    reducer: defaultMessageReducer(),
  });

  // The billing loop reads `events`, the tool/compile mirror reads
  // `data.messages`. Both are already populated before a single render.
  expect(store.snapshot.events).toHaveLength(savedEvents.length);
  expect(store.snapshot.data.messages.length).toBeGreaterThan(0);
  expect(store.snapshot.status).toBe("ready");
});
