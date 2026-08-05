import path from "path";
import type { FileNode } from "./storage";

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_FILE_BYTES = 100 * 1024 * 1024; // 100 MB per entry, decompressed
export const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB total, decompressed
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024; // 250 MB compressed upload

/** Returns the normalized safe relative path, or null if the entry must be rejected. */
export function safeZipPath(name: string): string | null {
  if (name.includes("\\")) return null;
  const norm = path.posix.normalize(name);
  if (norm.startsWith("..") || path.posix.isAbsolute(norm) || norm === "." || norm === "")
    return null;
  return norm;
}

/**
 * Detects a single top-level wrapper folder shared by every entry (e.g. a zip
 * exported as "My Project/main.tex", "My Project/fig.png", ...) and returns its
 * name so the caller can strip it — otherwise files land one level deeper than
 * what the uploader actually sees when they open the zip. Returns "" when the
 * zip has no common wrapper (already flat, or multiple top-level entries).
 */
export function stripCommonZipRoot(paths: string[]): string {
  const nested = paths.find((p) => p.includes("/"));
  if (!nested) return "";
  const first = nested.split("/")[0];
  if (!first) return "";
  return paths.every((p) => p.split("/")[0] === first) ? first : "";
}

/** Collects every node's `path` in a file tree into a flat set, for O(1) collision checks. */
export function flattenFilePaths(nodes: FileNode[], out: Set<string> = new Set()): Set<string> {
  for (const node of nodes) {
    out.add(node.path);
    if (node.children) flattenFilePaths(node.children, out);
  }
  return out;
}

/**
 * Returns a path (joined under targetDir) for `name` that isn't in existingPaths,
 * appending -1, -2, ... before the extension on collision. Never overwrites.
 */
export function dedupeUploadName(
  existingPaths: Set<string>,
  targetDir: string,
  name: string,
): string {
  const join = (n: string) => (targetDir ? `${targetDir}/${n}` : n);
  if (!existingPaths.has(join(name))) return join(name);

  const dotIdx = name.lastIndexOf(".");
  const base = dotIdx > 0 ? name.slice(0, dotIdx) : name;
  const ext = dotIdx > 0 ? name.slice(dotIdx) : "";

  let counter = 1;
  let candidate = join(`${base}-${counter}${ext}`);
  while (existingPaths.has(candidate)) {
    counter++;
    candidate = join(`${base}-${counter}${ext}`);
  }
  return candidate;
}
