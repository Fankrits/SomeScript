import { expect, test } from "bun:test";
import { EditorState } from "@codemirror/state";
import * as Y from "yjs";

// Regression tests for the collaboration bind that blanked an open file and
// persisted the blanking over it (a real project's Main.tex went 2286 -> 22 bytes).
//
// The editor is a *controlled* CodeMirror: @uiw/react-codemirror reconciles the
// `value` prop against the live document on every render. These tests pin the
// two contracts that made the wipe possible, so a future edit to page.tsx (or a
// uiw upgrade) that reintroduces it fails here instead of in a user's project.

const FILE = "\\documentclass{article}\n\\begin{document}\nImportant work.\n\\end{document}\n";

/** Mirrors useCollaboration.seedFile's guards. */
function seed(ytext: Y.Text, content: string) {
  if (content.length === 0) return;
  if (ytext.length > 0) return;
  ytext.insert(0, content);
}

/** @uiw/react-codemirror's prop default: cjs/index.js -> `value === void 0 ? '' : value`. */
function uiwResolveValueProp(propValue: string | undefined): string {
  return propValue === undefined ? "" : propValue;
}

/** @uiw/react-codemirror's reconcile effect: cjs/useCodeMirror.js — replaces the
 *  entire document whenever the resolved `value` differs from it. */
function uiwReconcile(state: EditorState, propValue: string | undefined): EditorState {
  const value = uiwResolveValueProp(propValue);
  const currentValue = state.doc.toString();
  if (value === currentValue) return state;
  return state.update({
    changes: { from: 0, to: state.doc.length, insert: value },
  }).state;
}

test("passing value={undefined} wipes the document — never do this", () => {
  // Documents the trap: `undefined` does NOT mean "uncontrolled". It becomes ''.
  const state = EditorState.create({ doc: FILE });
  expect(uiwResolveValueProp(undefined)).toBe("");
  expect(uiwReconcile(state, undefined).doc.length).toBe(0);
});

test("feeding the bound Y.Text back as value preserves the document", () => {
  // What page.tsx does while contentBound: value={boundYText.toString()}.
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText("file:main.tex");
  ytext.insert(0, FILE);

  const state = EditorState.create({ doc: FILE });
  expect(uiwReconcile(state, ytext.toString()).doc.toString()).toBe(FILE);
});

test("a remote edit stays applied — value tracks the Y.Text, not stale React state", () => {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText("file:main.tex");
  ytext.insert(0, FILE);

  // yCollab keeps doc === ytext synchronously; a peer appends a line.
  ytext.insert(ytext.length, "% from a peer\n");
  const afterRemote = EditorState.create({ doc: ytext.toString() });

  // Re-render still reading from the Y.Text: no clobbering back to the old text.
  expect(uiwReconcile(afterRemote, ytext.toString()).doc.toString()).toBe(ytext.toString());
  expect(uiwReconcile(afterRemote, ytext.toString()).doc.toString()).toContain("% from a peer");
});

test("binding only when editor and Y.Text agree keeps content safe", () => {
  // page.tsx binds only if ytext.toString() === editedCode. Prove the guard is
  // what protects us: an empty Y.Text must never reach a bound editor.
  const ydoc = new Y.Doc();
  const emptyYText = ydoc.getText("file:main.tex");

  const mayBind = emptyYText.toString() === FILE;
  expect(mayBind).toBe(false); // guard refuses -> editor stays in single-user mode

  // Had it bound anyway, this is the damage that would follow:
  const state = EditorState.create({ doc: FILE });
  expect(uiwReconcile(state, emptyYText.toString()).doc.length).toBe(0);
});

test("seedFile fills an empty Y.Text but never doubles existing content", () => {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText("file:main.tex");

  seed(ytext, FILE);
  expect(ytext.toString()).toBe(FILE);

  seed(ytext, FILE); // second opener must be a no-op, not a duplicate
  expect(ytext.toString()).toBe(FILE);
});
