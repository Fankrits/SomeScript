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

/** Reads a thread's current title from the sidebar list page.tsx owns. */
export function getThreadTitle(
  projectId: string,
  threadId: string,
  storage: Storage = localStorage,
): string {
  try {
    const list = JSON.parse(storage.getItem(threadsListKey(projectId)) ?? "[]") as {
      id: string;
      title: string;
    }[];
    return list.find((t) => t.id === threadId)?.title ?? "New Chat";
  } catch {
    return "New Chat";
  }
}

/**
 * Best-effort write-through backup to /api/eve/threads/[id] (which forwards
 * to the web app's chat_threads table — see apps/web/db/schema.ts). Never
 * throws: a failed backup must not disrupt the conversation, and localStorage
 * (already saved by the caller before this runs) remains the source of truth
 * for reads — this exists only so a cleared browser or quota eviction doesn't
 * lose history outright. Skipped for "default", the local sandbox project,
 * which has no server-side project row to attach to.
 */
export async function syncThreadToCloud(
  threadId: string,
  projectId: string,
  title: string,
  events: readonly unknown[],
  sessionState: unknown,
): Promise<void> {
  if (projectId === "default") return;
  try {
    const res = await fetch(`/api/eve/threads/${threadId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, title, events, sessionState }),
    });
    if (!res.ok) console.error("Cloud thread backup rejected", res.status, await res.text());
  } catch (e) {
    console.error("Cloud thread backup failed", e);
  }
}
