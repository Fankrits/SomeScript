import { useMemo } from "react";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { latex } from "codemirror-lang-latex";
import { search as searchExtension } from "@codemirror/search";
import { vim } from "@replit/codemirror-vim";
import { foldGutter, foldKeymap, bracketMatching } from "@codemirror/language";
import { keymap } from "@codemirror/view";
import { autocompletion } from "@codemirror/autocomplete";

export interface EditorSettings {
  mainFilePath: string;
  compilerEngine: string;
  tooltipsEnabled: boolean;
  draftMode: boolean;
  vimModeEnabled: boolean;
  foldingEnabled: boolean;
  autocompleteEnabled: boolean;
  bracketMatchingEnabled: boolean;
}

export function useCodeMirrorExtensions(
  settings: EditorSettings,
  currentLanguage: string
): Extension[] {
  return useMemo(() => {
    const extensions: Extension[] = [EditorView.lineWrapping, searchExtension()];

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

    return extensions;
  }, [
    settings.tooltipsEnabled,
    settings.vimModeEnabled,
    settings.foldingEnabled,
    settings.bracketMatchingEnabled,
    settings.autocompleteEnabled,
    currentLanguage,
  ]);
}
