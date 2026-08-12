import { expect, test } from "bun:test";
import {
  HISTORY_VERSION,
  activeThreadIdKey,
  capOversizedPayloads,
  collapseAppendedRuns,
  loadThreadHistory,
  saveThreadHistory,
  saveThreadMeta,
  threadKey,
  threadsListKey,
} from "./thread-history";

/**
 * Minimal Storage with a real byte budget, so the quota path is exercised the
 * way a browser exercises it (setItem throws once the origin is full) rather
 * than being simulated with a counter.
 */
function fakeStorage(budget: number): Storage & { bytes(): number } {
  const map = new Map<string, string>();
  const size = () => [...map.entries()].reduce((n, [k, v]) => n + k.length + v.length, 0);

  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    setItem(k: string, v: string) {
      const prev = map.get(k);
      map.delete(k);
      if (size() + k.length + v.length > budget) {
        if (prev !== undefined) map.set(k, prev); // failed write leaves the old value
        const err = new Error("QuotaExceededError");
        err.name = "QuotaExceededError";
        throw err;
      }
      map.set(k, v);
    },
    bytes: size,
  };
  // Object.keys(storage) must enumerate stored keys, as it does on the real thing.
  return new Proxy(store, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
    get: (t, p) => (t as never)[p],
  });
}

const event = (i: number) => ({ i, blob: "x".repeat(100) });

test("saves a thread and reads it back", () => {
  const s = fakeStorage(10_000);
  expect(saveThreadHistory("t1", "p1", [event(1)], { sessionId: "s" }, s)).toBe(true);
  const loaded = loadThreadHistory("t1", s);
  expect(loaded?.version).toBe(HISTORY_VERSION);
  expect(loaded?.events).toHaveLength(1);
});

test("drops a snapshot written by an incompatible version", () => {
  const s = fakeStorage(10_000);
  s.setItem(threadKey("t1"), JSON.stringify({ version: "eve-0.1", events: [] }));
  expect(loadThreadHistory("t1", s)).toBeNull();
});

test("reclaims space from threads the sidebar can no longer reach", () => {
  // Budget leaves no room for a new snapshot until the orphan goes.
  const s = fakeStorage(2_100);
  s.setItem(threadsListKey("p1"), JSON.stringify([{ id: "live" }]));
  // An orphan left behind by an older session, hogging most of the budget.
  s.setItem(threadKey("orphan"), "y".repeat(2_000));

  expect(saveThreadHistory("live", "p1", [event(1), event(2)], null, s)).toBe(true);
  expect(s.getItem(threadKey("orphan"))).toBeNull();
  // The live thread survived intact — nothing was trimmed to make room.
  expect(loadThreadHistory("live", s)?.events).toHaveLength(2);
});

test("never deletes a thread that is still listed", () => {
  // Tight enough that the first write fails and pruning has to run.
  const s = fakeStorage(1_800);
  s.setItem(threadsListKey("p1"), JSON.stringify([{ id: "keep" }, { id: "live" }]));
  s.setItem(threadKey("keep"), "y".repeat(1_500));

  // Space can only come from trimming, never from the still-listed thread.
  expect(saveThreadHistory("live", "p1", [event(1), event(2)], null, s)).toBe(true);
  expect(s.getItem(threadKey("keep"))).not.toBeNull();
});

test("does not prune threads belonging to a different project", () => {
  const s = fakeStorage(2_100);
  // Nothing listed for p1 yet — a thread from another project must survive.
  s.setItem(threadsListKey("p2"), JSON.stringify([{ id: "other-project-thread" }]));
  s.setItem(threadKey("other-project-thread"), "y".repeat(1_500));

  expect(saveThreadHistory("live", "p1", [event(1), event(2)], null, s)).toBe(true);
  expect(s.getItem(threadKey("other-project-thread"))).not.toBeNull();
});

test("trims oldest events when the newest still will not fit", () => {
  // Budget fits only a handful of the 40 events.
  const s = fakeStorage(1_200);
  const events = Array.from({ length: 40 }, (_, i) => event(i));

  expect(saveThreadHistory("t1", "p1", events, null, s)).toBe(true);

  const kept = loadThreadHistory("t1", s)!.events as { i: number }[];
  expect(kept.length).toBeGreaterThan(0);
  expect(kept.length).toBeLessThan(events.length);
  // The tail is what a reload needs: the newest event must survive.
  expect(kept[kept.length - 1].i).toBe(39);
  // ...and it must be a contiguous tail, not a random subset.
  expect(kept.map((e) => e.i)).toEqual(
    Array.from({ length: kept.length }, (_, n) => 40 - kept.length + n),
  );
});

test("reports failure when even one event cannot fit", () => {
  const s = fakeStorage(50);
  expect(saveThreadHistory("t1", "p1", [event(1)], null, s)).toBe(false);
});

test("a full store does not wedge later writes", () => {
  const s = fakeStorage(1_500);
  const big = Array.from({ length: 60 }, (_, i) => event(i));
  // First write trims to fit; the next turn must still be able to save.
  expect(saveThreadHistory("t1", "p1", big, null, s)).toBe(true);
  expect(saveThreadHistory("t1", "p1", [...big, event(60)], null, s)).toBe(true);
  expect(loadThreadHistory("t1", s)).not.toBeNull();
});

// --- saveThreadMeta ---------------------------------------------------------

test("writes thread-list metadata normally", () => {
  const s = fakeStorage(10_000);
  expect(saveThreadMeta(threadsListKey("p1"), JSON.stringify([{ id: "t1" }]), ["t1"], s)).toBe(
    true,
  );
  expect(s.getItem(threadsListKey("p1"))).toBe(JSON.stringify([{ id: "t1" }]));
});

test("reclaims an orphaned thread blob when a tiny metadata write hits a full origin", () => {
  // 1017 bytes of orphan + 30 of pointer > budget until the orphan goes.
  const s = fakeStorage(1_030);
  s.setItem(threadKey("orphan"), "y".repeat(1_000));

  expect(saveThreadMeta(activeThreadIdKey("p1"), "live-id", ["live-id"], s)).toBe(true);
  expect(s.getItem(threadKey("orphan"))).toBeNull();
  expect(s.getItem(activeThreadIdKey("p1"))).toBe("live-id");
});

test("does not delete a live thread's blob to make room for metadata", () => {
  // 1018 bytes of live blob + 30 of pointer > budget, and the live blob is
  // never a valid target for reclaiming — nothing to prune, write just fails.
  const s = fakeStorage(1_030);
  s.setItem(threadKey("live-id"), "y".repeat(1_000));

  expect(saveThreadMeta(activeThreadIdKey("p1"), "live-id", ["live-id"], s)).toBe(false);
  expect(s.getItem(threadKey("live-id"))).not.toBeNull();
});

test("returns false instead of throwing when even the metadata cannot fit", () => {
  const s = fakeStorage(5);
  expect(saveThreadMeta(activeThreadIdKey("p1"), "some-id", [], s)).toBe(false);
});

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

test("a long reply fits in the origin quota once collapsed", () => {
  // 600 chunks of 34 chars ~= 20 KB of visible text, which serialized
  // uncollapsed to ~5.9 MB and blew the ~5 MB quota.
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

test("a huge tool result fits in the origin quota once capped", () => {
  // One read-file/compile-project result, well past the ~5 MB origin quota
  // on its own — the case collapseAppendedRuns cannot help with, since
  // there is no streaming run to collapse.
  const events = [
    { type: "action.result", data: { result: { callId: "1", output: "z".repeat(6_000_000) } } },
  ];
  expect(JSON.stringify(events).length).toBeGreaterThan(5_000_000);
  expect(JSON.stringify(capOversizedPayloads(events)).length).toBeLessThan(1_000_000);
});
