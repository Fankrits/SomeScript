// Shared "did any peer bump this awareness field" signal behind every
// no-CRDT live-refresh: file tree, tasks, project settings. Each writer
// stamps an opaque token on its own awareness state after a successful
// save; everyone else diffs the composite key from versionKey() against
// what they last saw and refetches on change. None of these have real CRDT
// merge semantics — the underlying data is a whole-object overwrite (see
// api/tasks/route.ts, api/project-settings/route.ts) — so this only closes
// the staleness window, not a genuine write-write race between two saves.
export const FILE_TREE_VERSION_FIELD = "fileTreeVersion" as const;
export const TASK_LIST_VERSION_FIELD = "taskListVersion" as const;
export const PROJECT_SETTINGS_VERSION_FIELD = "projectSettingsVersion" as const;

export function createVersionToken(now = Date.now(), entropy = Math.random()): string {
  return `${now.toString(36)}-${entropy.toString(36).slice(2)}`;
}

/**
 * Stable key for one awareness field across all peers — cursor/selection
 * changes on other fields must not affect it, so only `field` is read.
 */
export function versionKey<T extends { clientId: number }>(peers: T[], field: keyof T): string {
  return peers
    .filter((peer) => typeof peer[field] === "string" && (peer[field] as string).length > 0)
    .map((peer) => `${peer.clientId}:${String(peer[field])}`)
    .toSorted()
    .join("|");
}

/** Backward-compatible file-tree-specific wrapper for older callers/tests. */
export function fileTreeVersionKey(
  peers: { clientId: number; fileTreeVersion?: string }[],
): string {
  return versionKey(peers, "fileTreeVersion");
}
