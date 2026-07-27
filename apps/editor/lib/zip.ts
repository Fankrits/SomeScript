import path from "path";

export const MAX_ZIP_ENTRIES = 2000;
export const MAX_ZIP_FILE_BYTES = 100 * 1024 * 1024;  // 100 MB per entry, decompressed
export const MAX_ZIP_TOTAL_BYTES = 500 * 1024 * 1024; // 500 MB total, decompressed
export const MAX_UPLOAD_BYTES = 250 * 1024 * 1024;    // 250 MB compressed upload

/** Returns the normalized safe relative path, or null if the entry must be rejected. */
export function safeZipPath(name: string): string | null {
  if (name.includes("\\")) return null;
  const norm = path.posix.normalize(name);
  if (norm.startsWith("..") || path.posix.isAbsolute(norm) || norm === "." || norm === "") return null;
  return norm;
}
