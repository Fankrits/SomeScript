import { expect, test } from "bun:test";
import { applyExactEdit, lineAtOffset } from "./edit-text";

const DOC = "\\section{Intro}\nAlpha beta.\n\\section{Method}\nAlpha gamma.\n";

test("replaces exactly-once matches and refuses empty, missing, and ambiguous oldText", () => {
  const ok = applyExactEdit(DOC, "Alpha beta.", "Alpha delta.");
  expect(ok.ok).toBe(true);
  if (ok.ok) {
    expect(ok.after).toBe("\\section{Intro}\nAlpha delta.\n\\section{Method}\nAlpha gamma.\n");
    expect(lineAtOffset(DOC, ok.index)).toBe(2);
  }

  // Empty oldText would splice at offset 0 rather than doing nothing.
  expect(applyExactEdit(DOC, "", "x")).toMatchObject({ ok: false, reason: "empty" });

  expect(applyExactEdit(DOC, "Alpha epsilon.", "x")).toMatchObject({
    ok: false,
    reason: "not-found",
  });

  // "Alpha " appears in both sections — replacing one silently would be wrong.
  expect(applyExactEdit(DOC, "Alpha ", "Beta ")).toMatchObject({ ok: false, reason: "ambiguous" });

  // Deleting is an edit to the empty string, not a special case.
  const deleted = applyExactEdit(DOC, "Alpha beta.\n", "");
  expect(deleted.ok).toBe(true);
  if (deleted.ok) expect(deleted.after).toBe("\\section{Intro}\n\\section{Method}\nAlpha gamma.\n");

  // Overlapping occurrences still count as two.
  expect(applyExactEdit("aaaa", "aa", "b")).toMatchObject({ ok: false, reason: "ambiguous" });
});
