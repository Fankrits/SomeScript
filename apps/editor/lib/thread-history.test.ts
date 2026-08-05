import { expect, test } from "bun:test";
import {
  HISTORY_VERSION,
  loadThreadHistory,
  saveThreadHistory,
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
