/**
 * Decides when the editor's idle auto-compile should run.
 *
 * It used to compare the buffer with the last *saved* text (`editedCode !== currentCode`).
 * But autosave writes the buffer one second after the last keystroke and then sets
 * `currentCode = editedCode`, which cancelled the three-second compile timer before it could
 * fire. Auto-compile therefore only worked while collaboration was bound (autosave is skipped
 * there) and never in single-user mode, which is the only mode the desktop app has.
 *
 * The baseline here is what the last compile saw (or what the file held when it was opened),
 * so saving never moves it.
 */

/** Idle time after the last edit before a background compile starts. */
export const AUTO_COMPILE_DELAY_MS = 3000;

export interface AutoCompileBaseline {
  path: string;
  code: string;
}

export type AutoCompilePlan =
  /** Nothing to do: off, no file, the buffer does not belong to the file yet, or no edits. */
  | { kind: "idle" }
  /** First look at this file: remember what it holds so opening it never triggers a compile. */
  | { kind: "adopt"; baseline: AutoCompileBaseline }
  /** The buffer differs from what was last compiled: compile after the idle delay. */
  | { kind: "schedule" };

export function planAutoCompile(input: {
  enabled: boolean;
  selectedPath: string | null;
  /** The path whose content the buffer actually holds (see `loadedPathRef` in app/page.tsx). */
  loadedPath: string | null;
  editedCode: string;
  baseline: AutoCompileBaseline | null;
}): AutoCompilePlan {
  const { enabled, selectedPath, loadedPath, editedCode, baseline } = input;
  if (!enabled || !selectedPath || loadedPath !== selectedPath) return { kind: "idle" };
  if (baseline?.path !== selectedPath) {
    return { kind: "adopt", baseline: { path: selectedPath, code: editedCode } };
  }
  return editedCode === baseline.code ? { kind: "idle" } : { kind: "schedule" };
}
