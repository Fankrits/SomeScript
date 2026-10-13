// Replaces apps/editor/lib/eve-threads-client.ts (cloud chat history). Until the BYOK
// assistant lands there is nothing to persist, so every call resolves immediately.
export interface ThreadMeta {
  id: string;
  title: string;
  createdAt: number;
}
export interface ThreadIndex {
  threads: ThreadMeta[];
  activeThreadId: string;
}
export type ThreadSnapshot = unknown;

export async function fetchThreadIndex(_projectId: string): Promise<ThreadIndex> {
  return { threads: [], activeThreadId: "" };
}
export async function saveThreadIndex(_projectId: string, _index: ThreadIndex): Promise<boolean> {
  return true;
}
export async function fetchThreadSnapshot(
  _projectId: string,
  _threadId: string,
): Promise<ThreadSnapshot | null> {
  return null;
}
export async function saveThreadSnapshot(..._args: unknown[]): Promise<boolean> {
  return true;
}
export async function deleteThread(_projectId: string, _threadId: string): Promise<boolean> {
  return true;
}
export async function migrateLocalThreads(..._args: unknown[]): Promise<boolean> {
  return true;
}
