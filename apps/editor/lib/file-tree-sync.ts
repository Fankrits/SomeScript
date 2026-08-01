export const FILE_TREE_VERSION_FIELD = "fileTreeVersion";

export interface FileTreeVersionedPeer {
  clientId: number;
  fileTreeVersion?: string;
}

/**
 * Produces a stable key for filesystem mutation signals only. Cursor and
 * selection awareness changes must not trigger a file-tree reload.
 */
export function fileTreeVersionKey(peers: FileTreeVersionedPeer[]): string {
  return peers
    .filter((peer) => typeof peer.fileTreeVersion === "string" && peer.fileTreeVersion.length > 0)
    .map((peer) => `${peer.clientId}:${peer.fileTreeVersion}`)
    .sort()
    .join("|");
}

export function createFileTreeVersion(now = Date.now(), entropy = Math.random()): string {
  return `${now.toString(36)}-${entropy.toString(36).slice(2)}`;
}
