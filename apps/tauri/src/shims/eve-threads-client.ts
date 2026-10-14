// Replaces apps/editor/lib/eve-threads-client.ts (the cloud chat history, which talks to the
// hosted `/api/eve/*` routes). On desktop the history lives in the project folder
// (`.somescript/chat/`), served by `src-tauri/src/api/ai.rs`. Same function names and the same
// index shape, so the editor's history menu works unchanged.
export interface ThreadMeta {
  id: string;
  title: string;
  createdAt: number;
}
export interface ThreadIndex {
  threads: ThreadMeta[];
  activeThreadId: string;
}
/** What `useChat` saves: the conversation's messages, versioned by the server. */
export interface ThreadSnapshot {
  version: number;
  messages: unknown[];
}

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status})`);
  return body as T;
}

const q = (projectId: string) => `projectId=${encodeURIComponent(projectId)}`;

export async function fetchThreadIndex(projectId: string): Promise<ThreadIndex> {
  const { index } = await json<{ index: ThreadIndex }>(
    await fetch(`/api/chat/threads?${q(projectId)}`),
  );
  return index;
}

export async function saveThreadIndex(projectId: string, index: ThreadIndex): Promise<boolean> {
  try {
    await json(
      await fetch("/api/chat/threads", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, index }),
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to save the chat list", e);
    return false;
  }
}

export async function fetchThreadSnapshot(
  projectId: string,
  threadId: string,
): Promise<ThreadSnapshot | null> {
  const { snapshot } = await json<{ snapshot: ThreadSnapshot | null }>(
    await fetch(`/api/chat/thread?${q(projectId)}&threadId=${encodeURIComponent(threadId)}`),
  );
  return snapshot;
}

/** `_sessionState` is the cloud runtime's resume token; there is nothing like it here. */
export async function saveThreadSnapshot(
  projectId: string,
  threadId: string,
  messages: readonly unknown[],
  _sessionState?: unknown,
): Promise<boolean> {
  try {
    await json(
      await fetch("/api/chat/thread", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, threadId, messages }),
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to save the conversation", e);
    return false;
  }
}

export async function deleteThread(projectId: string, threadId: string): Promise<boolean> {
  try {
    await json(
      await fetch(`/api/chat/thread?${q(projectId)}&threadId=${encodeURIComponent(threadId)}`, {
        method: "DELETE",
      }),
    );
    return true;
  } catch (e) {
    console.error("Failed to delete the conversation", e);
    return false;
  }
}

/** Cloud-only: moves a browser's old localStorage chats to the server. Nothing to move here. */
export async function migrateLocalThreads(..._args: unknown[]): Promise<boolean> {
  return true;
}
