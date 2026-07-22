import type { EditorView } from "@codemirror/view"
import type { EditorState } from "@codemirror/state"
import { syntaxTree } from "@codemirror/language"

// codemirror-lang-latex tags each formatting command's control sequence with its
// own node name. A command node's first child is that ctrl-seq, so walking the
// caret's ancestors and matching first-child names tells us what the caret is inside.
const CTRL_SEQ_FORMAT: Record<string, string> = {
  TextBoldCtrlSeq: "bold",
  TextItalicCtrlSeq: "italic",
  UnderlineCtrlSeq: "underline",
}

/**
 * Formats the caret currently sits inside (e.g. "bold,italic,math"), as a sorted
 * comma-joined key so React bails out of re-render when it hasn't changed. Drives
 * the toolbar's active-button highlighting.
 */
export function activeFormats(state: EditorState): string {
  const pos = state.selection.main.head
  const tree = syntaxTree(state)
  let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1)
  const found = new Set<string>()
  while (node) {
    if (node.name === "Math" || node.name === "DollarMath") found.add("math")
    const first = node.firstChild
    if (first && CTRL_SEQ_FORMAT[first.name]) found.add(CTRL_SEQ_FORMAT[first.name])
    node = node.parent
  }
  return [...found].sort().join(",")
}

/**
 * Given a snippet like `\textbf{}` and the currently-selected text, decide what
 * to actually insert and where the resulting selection lands.
 *
 * `cursorOffset` is where the caret would sit relative to the snippet's end
 * (<= 0, e.g. -1 for the gap in `\textbf{}`). When there is a selection, the
 * selected text is spliced in at that caret point so "select X, click Bold"
 * yields `\textbf{X}` instead of overwriting X. With no selection the caret is
 * just placed at that point so the user can type.
 *
 * Pure and viewless so the splice math stays unit-testable — see
 * latex-insert.test.ts.
 */
export function buildInsertion(
  snippet: string,
  selected: string,
  cursorOffset: number,
): { text: string; anchor: number; head: number } {
  const splitAt = snippet.length + cursorOffset
  const wrap = selected.length > 0 && splitAt >= 0 && splitAt <= snippet.length
  if (wrap) {
    const text = snippet.slice(0, splitAt) + selected + snippet.slice(splitAt)
    return { text, anchor: splitAt, head: splitAt + selected.length }
  }
  return { text: snippet, anchor: splitAt, head: splitAt }
}

/**
 * Insert a LaTeX snippet at the current selection, wrapping it when non-empty.
 * Returns true so it can double as a CodeMirror keymap `run` handler.
 */
export function wrapInsert(view: EditorView, snippet: string, cursorOffset = 0): boolean {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)
  const { text, anchor, head } = buildInsertion(snippet, selected, cursorOffset)

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: { anchor: range.from + anchor, head: range.from + head },
    userEvent: "input",
  })
  view.focus()
  return true
}
