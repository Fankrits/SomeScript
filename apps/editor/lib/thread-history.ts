/**
 * localStorage persistence for Eve chat threads.
 *
 * Kept apart from the runtime hook because the interesting part is the
 * recovery behaviour when the origin quota is exhausted, which is worth
 * testing on its own.
 */

// Stamped into saved threads. Bump on any eve upgrade, or any change to what
// is persisted, so state the current client cannot replay is discarded.
export const HISTORY_VERSION = "eve-0.26";

export const THREAD_KEY_PREFIX = "eve-thread-";
export const threadKey = (id: string) => `${THREAD_KEY_PREFIX}${id}`;

export type ThreadSnapshot<E = unknown, S = unknown> = {
  version: string;
  events: E[];
  sessionState: S;
};

/**
 * Reads a saved thread, dropping any blob this client cannot replay.
 *
 * The type parameters are an assertion about a blob that came from JSON, not a
 * guarantee — `HISTORY_VERSION` is what actually gates replay compatibility,
 * and a stamp mismatch discards the blob before it reaches the caller.
 */
export function loadThreadHistory<E = unknown, S = unknown>(
  threadId: string,
  storage: Storage,
): ThreadSnapshot<E, S> | null {
  const saved = storage.getItem(threadKey(threadId));
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    return parsed?.version === HISTORY_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/** Drops saved blobs for threads the sidebar can no longer reach. */
function pruneOrphanedThreads(keepKey: string, storage: Storage) {
  let live: { id: string }[];
  try {
    live = JSON.parse(storage.getItem("eve-threads-list") ?? "[]");
    if (!Array.isArray(live)) return;
  } catch {
    return; // Unreadable list — deleting on a guess would drop real threads.
  }
  const liveKeys = new Set(live.map((t) => threadKey(t.id)));
  for (const key of Object.keys(storage)) {
    if (key.startsWith(THREAD_KEY_PREFIX) && key !== keepKey && !liveKeys.has(key)) {
      storage.removeItem(key);
    }
  }
}

/**
 * Writes the thread snapshot, recovering from a full localStorage rather than
 * giving up on it.
 *
 * The origin quota is a hard ~5MB and the event log grows with every tool
 * result — one Tectonic log or a read_file over a large .tex runs to hundreds
 * of KB — so a long session eventually cannot save at all. Worse, the write
 * runs on every turn, so once it starts failing it fails forever: the
 * conversation silently stops persisting and the console fills with the same
 * error.
 *
 * Recover in escalating steps, cheapest loss first: drop unreachable threads
 * (pure garbage), then this thread's own stale blob (about to be replaced
 * anyway), then the oldest events — what a reload needs least.
 *
 * Returns false only when even a single event will not fit.
 */
export function saveThreadHistory(
  threadId: string,
  events: readonly unknown[],
  sessionState: unknown,
  storage: Storage = localStorage,
): boolean {
  const key = threadKey(threadId);
  const write = (evts: readonly unknown[]) =>
    storage.setItem(
      key,
      JSON.stringify({ version: HISTORY_VERSION, events: evts, sessionState }),
    );

  try {
    write(events);
    return true;
  } catch {
    // Out of quota — escalate.
  }

  pruneOrphanedThreads(key, storage);
  try {
    write(events);
    return true;
  } catch {
    // Still over.
  }

  // Reclaim this thread's previous blob, usually the single largest entry,
  // then keep halving off the front until the newest turns fit.
  storage.removeItem(key);
  let kept = events;
  while (kept.length > 1) {
    kept = kept.slice(Math.ceil(kept.length / 2));
    try {
      write(kept);
      return true;
    } catch {
      // Keep shrinking.
    }
  }
  return false;
}
