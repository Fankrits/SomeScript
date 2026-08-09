/**
 * localStorage persistence for Eve chat threads.
 *
 * Kept apart from the runtime hook because the interesting part is the
 * recovery behaviour when the origin quota is exhausted, which is worth
 * testing on its own.
 */

// Stamped into saved threads. Bump on any eve upgrade, or any change to what
// is persisted, so state the current client cannot replay is discarded.
// (Was left at "eve-0.26" across the 0.31 upgrade, which changed the session
// state type — those blobs were being replayed into the new reducer.)
export const HISTORY_VERSION = "eve-0.31";

const APPENDED_TYPES = new Set(["message.appended", "reasoning.appended"]);

/**
 * Collapses eve's streaming text runs down to their final event.
 *
 * eve streams text by resending the whole message: every `message.appended`
 * carries `messageSoFar`, the full text up to that point (see
 * `messageSoFar` in eve/dist/src/protocol/message.d.ts), and the client keeps
 * every event. So one reply of N chunks costs O(N²) characters to store — a
 * 20 KB answer serializes to ~6 MB, past the ~5 MB origin quota, and a model
 * stuck in a repetition loop reaches tens of MB. Stringifying that on the
 * autosave path froze the main thread, which is what made the chat look
 * "stuck" mid-reply.
 *
 * Only the newest `*.appended` per (turnId, stepIndex) is needed: the
 * reducer's `upsertRun` replaces the still-`streaming` part in place, and
 * `message.completed` overwrites it with the final text anyway. Keeping the
 * last one replays identically — including for a turn abandoned mid-stream,
 * which never gets a `completed` event and so still needs its partial text.
 *
 * Caveat: eve documents `initialEvents` as "an ordered prefix of the same
 * session's stream" (docs/guides/frontend/overview.mdx), and collapsing makes
 * it a subsequence instead. That is safe here only because resume rides on
 * `initialSession.streamIndex`, not on the saved log's length. If anyone
 * adopts the lower-level reconnect the same doc describes —
 * `session.stream({ startIndex: savedEvents.length })` — that length is no
 * longer the stream position and the collapse has to move behind it.
 */
export function collapseAppendedRuns<T>(events: readonly T[]): T[] {
  const newest = new Map<string, number>();
  events.forEach((event, i) => {
    const e = event as { type?: string; data?: { turnId?: string; stepIndex?: number } } | null;
    if (e?.type && APPENDED_TYPES.has(e.type)) {
      newest.set(`${e.type}:${e.data?.turnId}:${e.data?.stepIndex}`, i);
    }
  });
  if (newest.size === 0) return events as T[];
  const keep = new Set(newest.values());
  return events.filter((event, i) => {
    const type = (event as { type?: string } | null)?.type;
    return !type || !APPENDED_TYPES.has(type) || keep.has(i);
  });
}

export const THREAD_KEY_PREFIX = "eve-thread-";
export const threadKey = (id: string) => `${THREAD_KEY_PREFIX}${id}`;

// Thread blobs (above) key by the thread's own UUID, which never collides
// across projects — only the "which threads exist / which is active" pointers
// need to be per-project, so a chat sidebar opened for one project doesn't
// show another project's history.
export const threadsListKey = (projectId: string) => `eve-threads-list-${projectId}`;
export const activeThreadIdKey = (projectId: string) => `eve-active-thread-id-${projectId}`;

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
function pruneOrphanedThreads(keepKey: string, listKey: string, storage: Storage) {
  let live: { id: string }[];
  try {
    live = JSON.parse(storage.getItem(listKey) ?? "[]");
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
  projectId: string,
  events: readonly unknown[],
  sessionState: unknown,
  storage: Storage = localStorage,
): boolean {
  const key = threadKey(threadId);
  const write = (evts: readonly unknown[]) =>
    storage.setItem(key, JSON.stringify({ version: HISTORY_VERSION, events: evts, sessionState }));

  try {
    write(events);
    return true;
  } catch {
    // Out of quota — escalate.
  }

  pruneOrphanedThreads(key, threadsListKey(projectId), storage);
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
