import type * as Y from "yjs";

// Applies `next` to `ytext` as a single contiguous prefix/suffix splice rather
// than a full replace. A full replace would delete-then-reinsert the whole
// text as one op, which blows away any concurrent peer edit sitting inside it
// and teleports every peer's cursor. Splicing only the changed span leaves
// unrelated regions — and the CRDT positions inside them — untouched.
// ponytail: one contiguous span; a rewrite scattered across the file collapses
// to one big delete+insert spanning both. Upgrade to the `diff` package
// (already a dependency in apps/editor) for a real multi-hunk diff if peer
// cursors need to survive that case.
/** Returns true when it actually mutated the text (i.e. minted operations). */
export function spliceText(ytext: Y.Text, next: string): boolean {
  const prev = ytext.toString();
  if (prev === next) return false;
  let start = 0;
  const maxStart = Math.min(prev.length, next.length);
  while (start < maxStart && prev[start] === next[start]) start++;
  let end = 0;
  const maxEnd = maxStart - start;
  while (end < maxEnd && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++;
  const doc = ytext.doc;
  if (!doc) return false;
  doc.transact(() => {
    const delLen = prev.length - start - end;
    if (delLen > 0) ytext.delete(start, delLen);
    const inserted = next.slice(start, next.length - end);
    if (inserted) ytext.insert(start, inserted);
  });
  return true;
}
