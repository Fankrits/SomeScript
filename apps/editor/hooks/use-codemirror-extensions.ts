import { useMemo } from "react";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { latex } from "codemirror-lang-latex";
import { search as searchExtension } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";
import { lintGutter } from "@codemirror/lint";
import { wrapInsert } from "@/lib/latex-insert";

// @codemirror/lint's default gutter marker is a colored SVG circle set via
// `content: url(...)`, which behaves like a replaced image — it keeps its own
// aspect ratio inside the box instead of stretching, so resizing the box alone
// still renders a (smaller) circle. Clearing `content` back to an empty string
// drops the SVG and lets the marker's own background-color paint the box
// instead, so a thin full-height box reads as a solid line. Still no new gutter
// or state — same setDiagnostics() dispatch, EditorView.theme() just overrides
const compactLintGutterTheme = EditorView.theme({
  ".cm-gutter-lint": { width: "5px", padding: "0" },
  ".cm-gutter-lint .cm-gutterElement": { padding: "0" },
  ".cm-lint-marker": { width: "3px", height: "100%" },
  ".cm-lint-marker-error": { content: '""', backgroundColor: "#ef4444" },
});

const collabCursorTheme = EditorView.theme({
  ".cm-ySelection": {
    backgroundColor: "rgba(59, 130, 246, 0.25)",
  },
  ".cm-ySelectionCaret": {
    position: "relative",
    borderLeft: "2px solid #3b82f6",
    borderRight: "0 none",
    marginLeft: "-1px",
    marginRight: "-1px",
    boxSizing: "border-box",
  },
  ".cm-ySelectionCaretDot": {
    position: "absolute",
    top: "-3px",
    left: "-3px",
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "inherit",
  },
  // y-codemirror.next's own name tag is text-only and hover-gated by its
  // base theme (opacity: 0 until :hover) — superseded by the always-visible
  // avatar in <RemoteCursorAvatars>, which renders at the same spot.
  ".cm-ySelectionInfo": {
    display: "none",
  },
});

import { yCollab } from "y-codemirror.next";
import type * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";

// y-protocols' Awareness, sourced through the provider (a direct dep) since
// y-protocols is only transitively installed and not resolvable on its own.
// This is exactly the value the caller passes in — provider.awareness.
type Awareness = NonNullable<HocuspocusProvider["awareness"]>;

export interface CollaborationConfig {
  ytext?: Y.Text;
  // null when the provider has awareness disabled; the guard below treats it
  // the same as undefined, so both callers and the memo need only truthiness.
  awareness?: Awareness | null;
}

export interface EditorSettings {
  mainFilePath: string;
  compilerEngine: string;
  tooltipsEnabled: boolean;
  vimModeEnabled: boolean;
  foldingEnabled: boolean;
  autocompleteEnabled: boolean;
  bracketMatchingEnabled: boolean;
}

export function useCodeMirrorExtensions(
  settings: EditorSettings,
  currentLanguage: string,
  collaboration?: CollaborationConfig,
): Extension[] {
  // Hoist to locals so the memo body reads plain variables whose access shape
  // matches the dependency array exactly. Reading `collaboration?.ytext` inside
  // the closure while listing the same optional-chained access as a dep makes
  // the React Compiler infer a broader dependency (`collaboration`) than the
  // hand-written one and bail out of optimizing this hook entirely.
  const ytext = collaboration?.ytext;
  const awareness = collaboration?.awareness;
  return useMemo(() => {
    const extensions: Extension[] = [
      EditorView.lineWrapping,
      searchExtension(),
      lintGutter(),
      compactLintGutterTheme,
    ];

    if (ytext && awareness) {
      extensions.push(yCollab(ytext, awareness));
      extensions.push(collabCursorTheme);
    }

    if (currentLanguage === "latex") {
      extensions.push(latex({ enableTooltips: settings.tooltipsEnabled }));
    }

    if (settings.vimModeEnabled) {
      extensions.push(vim());
    }

    if (settings.foldingEnabled) {
      extensions.push(foldGutter());
      extensions.push(keymap.of(foldKeymap));
    }

    if (settings.bracketMatchingEnabled) {
      extensions.push(bracketMatching());
    }

    if (settings.autocompleteEnabled) {
      extensions.push(autocompletion());
    }

    if (currentLanguage === "latex") {
      extensions.push(
        keymap.of([
          { key: "Mod-b", run: (v) => wrapInsert(v, "\\textbf{}", -1) },
          { key: "Mod-i", run: (v) => wrapInsert(v, "\\textit{}", -1) },
          { key: "Mod-u", run: (v) => wrapInsert(v, "\\underline{}", -1) },
          { key: "Mod-m", run: (v) => wrapInsert(v, "$ $", -1) },
          { key: "Mod-Shift-m", run: (v) => wrapInsert(v, "\\[\n  \n\\]", -3) },
        ]),
      );
    }

    return extensions;
  }, [
    settings.tooltipsEnabled,
    settings.vimModeEnabled,
    settings.foldingEnabled,
    settings.bracketMatchingEnabled,
    settings.autocompleteEnabled,
    currentLanguage,
    ytext,
    awareness,
  ]);
}
