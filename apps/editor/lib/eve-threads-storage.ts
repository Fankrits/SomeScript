import { storage, type StorageProvider } from "./storage";
import { HISTORY_VERSION, type ThreadSnapshot } from "./thread-history";

export { HISTORY_VERSION, collapseAppendedRuns, capOversizedPayloads } from "./thread-history";
export type { ThreadSnapshot } from "./thread-history";

const MAX_THREADS = 200;
const MAX_TITLE_LENGTH = 200;

export interface ThreadMeta {
  id: string;
  title: string;
  createdAt: number;
}

export interface ThreadIndex {
  threads: ThreadMeta[];
  activeThreadId: string;
}

const EMPTY_INDEX: ThreadIndex = { threads: [], activeThreadId: "" };

export const eveThreadsDir = (userId: string) => `.somescript/eve-threads/${userId}`;
export const indexPath = (userId: string) => `${eveThreadsDir(userId)}/index.json`;
export const threadPath = (userId: string, threadId: string) =>
  `${eveThreadsDir(userId)}/${threadId}.json`;

/** Coerce untrusted JSON (request body, or a hand-edited file) into a ThreadIndex. */
export function sanitizeIndex(input: unknown): ThreadIndex {
  if (typeof input !== "object" || input === null) return EMPTY_INDEX;
  const raw = input as Record<string, unknown>;
  if (!Array.isArray(raw.threads)) return EMPTY_INDEX;

  const threads: ThreadMeta[] = [];
  for (const entry of raw.threads) {
    if (typeof entry !== "object" || entry === null) continue;
    const t = entry as Record<string, unknown>;
    if (typeof t.id !== "string" || typeof t.title !== "string") continue;
    threads.push({
      id: t.id,
      title: t.title.slice(0, MAX_TITLE_LENGTH),
      createdAt: typeof t.createdAt === "number" && Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
    });
    if (threads.length >= MAX_THREADS) break;
  }

  const activeThreadId =
    typeof raw.activeThreadId === "string" && threads.some((t) => t.id === raw.activeThreadId)
      ? raw.activeThreadId
      : "";

  return { threads, activeThreadId };
}

/** Coerce untrusted JSON into a ThreadSnapshot, or null if it isn't one this client can replay. */
export function sanitizeThreadSnapshot(input: unknown): ThreadSnapshot | null {
  if (typeof input !== "object" || input === null) return null;
  const raw = input as Record<string, unknown>;
  if (raw.version !== HISTORY_VERSION) return null;
  if (!Array.isArray(raw.events)) return null;
  return { version: raw.version, events: raw.events, sessionState: raw.sessionState };
}

/** Reads the user's thread index for a project. Missing or unreadable file → empty index. */
export async function readIndex(
  userId: string,
  projectId: string,
  s: Pick<StorageProvider, "readFile"> = storage,
): Promise<ThreadIndex> {
  try {
    return sanitizeIndex(JSON.parse(await s.readFile(projectId, indexPath(userId))));
  } catch {
    return EMPTY_INDEX;
  }
}

/**
 * Reads a saved thread, dropping any blob this client cannot replay — same
 * HISTORY_VERSION gate as the localStorage version this replaces.
 */
export async function readThreadSnapshot(
  userId: string,
  projectId: string,
  threadId: string,
  s: Pick<StorageProvider, "readFile"> = storage,
): Promise<ThreadSnapshot | null> {
  try {
    return sanitizeThreadSnapshot(JSON.parse(await s.readFile(projectId, threadPath(userId, threadId))));
  } catch {
    return null;
  }
}
