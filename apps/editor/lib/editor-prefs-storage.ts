import { storage, type StorageProvider } from "./storage";

export interface EditorPrefs {
  tooltipsEnabled: boolean;
  vimModeEnabled: boolean;
  foldingEnabled: boolean;
  autocompleteEnabled: boolean;
  bracketMatchingEnabled: boolean;
  /** Project-relative path of the file to reopen on next visit, or null. */
  lastOpenFile: string | null;
}

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  tooltipsEnabled: true,
  vimModeEnabled: false,
  foldingEnabled: true,
  autocompleteEnabled: true,
  bracketMatchingEnabled: true,
  lastOpenFile: null,
};

const MAX_PATH_LENGTH = 2000;

export const editorPrefsPath = (userId: string) => `.somescript/editor-prefs/${userId}.json`;

/** Coerce untrusted JSON (request body, or a hand-edited file) into EditorPrefs. */
export function sanitizeEditorPrefs(input: unknown): EditorPrefs {
  if (typeof input !== "object" || input === null) return DEFAULT_EDITOR_PREFS;
  const raw = input as Record<string, unknown>;
  return {
    tooltipsEnabled: typeof raw.tooltipsEnabled === "boolean" ? raw.tooltipsEnabled : true,
    vimModeEnabled: typeof raw.vimModeEnabled === "boolean" ? raw.vimModeEnabled : false,
    foldingEnabled: typeof raw.foldingEnabled === "boolean" ? raw.foldingEnabled : true,
    autocompleteEnabled:
      typeof raw.autocompleteEnabled === "boolean" ? raw.autocompleteEnabled : true,
    bracketMatchingEnabled:
      typeof raw.bracketMatchingEnabled === "boolean" ? raw.bracketMatchingEnabled : true,
    lastOpenFile:
      typeof raw.lastOpenFile === "string" ? raw.lastOpenFile.slice(0, MAX_PATH_LENGTH) : null,
  };
}

/** Reads the user's editor prefs for a project. Missing or unreadable file → defaults. */
export async function readEditorPrefs(
  userId: string,
  projectId: string,
  s: Pick<StorageProvider, "readFile"> = storage,
): Promise<EditorPrefs> {
  try {
    return sanitizeEditorPrefs(JSON.parse(await s.readFile(projectId, editorPrefsPath(userId))));
  } catch {
    return DEFAULT_EDITOR_PREFS;
  }
}
