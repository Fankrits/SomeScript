/**
 * Exact-once string replacement, the primitive behind agent/tools/edit-file.ts.
 *
 * Kept pure and dependency-free so it is both testable under `bun test` and
 * safe to bundle into eve's tool runtime.
 */

export type ExactEditResult =
  | { ok: true; after: string; index: number }
  | { ok: false; reason: "empty" | "not-found" | "ambiguous" };

export function applyExactEdit(source: string, oldText: string, newText: string): ExactEditResult {
  // indexOf("") returns 0, which would silently splice newText onto the front of
  // the file. Refusing is the only safe reading of an empty oldText.
  if (oldText === "") return { ok: false, reason: "empty" };

  const index = source.indexOf(oldText);
  if (index < 0) return { ok: false, reason: "not-found" };

  // Two indexOf calls rather than split(): split allocates the whole file into an
  // array just to count, and we only need to know whether a second one exists.
  if (source.indexOf(oldText, index + oldText.length) >= 0) {
    return { ok: false, reason: "ambiguous" };
  }

  return {
    ok: true,
    after: source.slice(0, index) + newText + source.slice(index + oldText.length),
    index,
  };
}

/** 1-based line number of a character offset, for the "replaced 1 block at line N" note. */
export function lineAtOffset(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}
