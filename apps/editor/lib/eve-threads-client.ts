// Browser-side counterpart to lib/eve-threads-storage.ts. Talks to the
// /api/eve/threads(/migrate) and /api/eve/thread routes instead of reading
// project storage directly — this file only ever runs client-side, so it
// must not import lib/storage.ts (pulls in "fs/promises" and the S3 SDK,
// which cannot bundle into the browser). Types are imported with `import
// type` so they're erased at compile time and never pull the server module
// into the client bundle.
import type { ThreadIndex, ThreadMeta } from "./eve-threads-storage";
import type { ThreadSnapshot } from "./thread-history";

export type { ThreadIndex, ThreadMeta, ThreadSnapshot };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => res.statusText)}`);
  return res.json();
}

export async function fetchThreadIndex(projectId: string): Promise<ThreadIndex> {
  const { index } = await json<{ index: ThreadIndex }>(
    await fetch(`/api/eve/threads?projectId=${encodeURIComponent(projectId)}`),
  );
  return index;
}

export async function saveThreadIndex(projectId: string, index: ThreadIndex): Promise<boolean> {
  try {
    await json(
      await fetch("/api/eve/threads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, index }),
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to save thread index", e);
    return false;
  }
}

export async function fetchThreadSnapshot<E = unknown, S = unknown>(
  projectId: string,
  threadId: string,
): Promise<ThreadSnapshot<E, S> | null> {
  const { snapshot } = await json<{ snapshot: ThreadSnapshot<E, S> | null }>(
    await fetch(
      `/api/eve/thread?projectId=${encodeURIComponent(projectId)}&threadId=${encodeURIComponent(threadId)}`,
    ),
  );
  return snapshot;
}

/** Mirrors today's saveThreadHistory's boolean return contract — false on any failure. */
export async function saveThreadSnapshot(
  projectId: string,
  threadId: string,
  events: readonly unknown[],
  sessionState: unknown,
): Promise<boolean> {
  try {
    await json(
      await fetch("/api/eve/thread", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, threadId, events, sessionState }),
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to save thread", e);
    return false;
  }
}

export async function deleteThread(projectId: string, threadId: string): Promise<boolean> {
  try {
    await json(
      await fetch(
        `/api/eve/thread?projectId=${encodeURIComponent(projectId)}&threadId=${encodeURIComponent(threadId)}`,
        { method: "DELETE" },
      ),
    );
    return true;
  } catch (e) {
    console.error("Failed to delete thread", e);
    return false;
  }
}

export async function migrateLocalThreads(
  projectId: string,
  index: ThreadIndex,
  threads: { id: string; snapshot: unknown }[],
): Promise<boolean> {
  try {
    await json(
      await fetch("/api/eve/threads/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, index, threads }),
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to migrate local threads", e);
    return false;
  }
}
