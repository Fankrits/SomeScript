import { storage, type StorageProvider } from "./storage";

export const PROJECT_SETTINGS_PATH = ".somescript/project-settings.json";

// Only the fields that are genuinely project properties — if collaborators
// disagree on these, compiles are wrong. Personal editor preferences (vim
// mode, tooltips, folding, ...) stay client-side; see page.tsx.
export interface ProjectSettings {
  mainFilePath: string;
  compilerEngine: string;
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  mainFilePath: "main.tex",
  compilerEngine: "tectonic",
};

/** Coerce untrusted JSON (request body, or a hand-edited file) into ProjectSettings. */
export function sanitizeProjectSettings(input: unknown): ProjectSettings {
  const s = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  return {
    mainFilePath:
      typeof s.mainFilePath === "string" &&
      s.mainFilePath.length > 0 &&
      s.mainFilePath.length <= 1024
        ? s.mainFilePath
        : DEFAULT_PROJECT_SETTINGS.mainFilePath,
    compilerEngine:
      typeof s.compilerEngine === "string" && s.compilerEngine.length <= 64
        ? s.compilerEngine
        : DEFAULT_PROJECT_SETTINGS.compilerEngine,
  };
}

/** Reads the project's settings. Missing or unreadable file -> defaults. */
export async function readProjectSettings(
  projectId: string,
  s: Pick<StorageProvider, "readFile"> = storage,
): Promise<ProjectSettings> {
  try {
    const content = await s.readFile(projectId, PROJECT_SETTINGS_PATH);
    return sanitizeProjectSettings(JSON.parse(content));
  } catch {
    return { ...DEFAULT_PROJECT_SETTINGS };
  }
}

export type SetMainFileResult =
  | { ok: true; mainFilePath: string; previousMainFilePath: string }
  | { ok: false; error: string };

/**
 * Validates and persists a new mainFilePath. The existence check matters: a
 * mainFilePath pointing at a file that isn't there would silently break
 * every future compile-project call instead of failing here, once, clearly.
 */
export async function setMainFile(
  projectId: string,
  path: string,
  s: Pick<StorageProvider, "readFile" | "writeFile"> = storage,
): Promise<SetMainFileResult> {
  if (!path.endsWith(".tex")) {
    return { ok: false, error: "only .tex files can be the main file" };
  }

  try {
    await s.readFile(projectId, path);
  } catch {
    return { ok: false, error: "no such file in the project" };
  }

  const current = await readProjectSettings(projectId, s);
  const next = sanitizeProjectSettings({ ...current, mainFilePath: path });
  await s.writeFile(projectId, PROJECT_SETTINGS_PATH, JSON.stringify(next));

  return { ok: true, mainFilePath: path, previousMainFilePath: current.mainFilePath };
}
