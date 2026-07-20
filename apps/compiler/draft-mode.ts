import fs from "fs/promises";

// Draft mode, as Overleaf's CLSI does it (services/clsi/app/js/DraftModeManager.js):
// prepend the graphics draft option so images become empty boxes. Deliberately NOT
// "-r 0" (single TeX pass) — that also skips the reruns that resolve \ref, \cite and
// the TOC, so a draft build would silently render them all as "??".
//
// No trailing newline: it stays on line 1 with \documentclass so every SyncTeX
// line number still matches the user's source.
export const DRAFT_PREFIX =
  "\\PassOptionsToPackage{draft}{graphicx}\\PassOptionsToPackage{draft}{graphics}";

/**
 * Idempotent in both directions — the upload workspace persists across compiles
 * and a differential sync may not re-send the root file, so this has to cope with
 * a prefix left over from a previous build (and remove it when draft is off).
 */
export async function applyDraftMode(texPath: string, draft: boolean) {
  const content = await fs.readFile(texPath, "utf-8");
  const stripped = content.startsWith(DRAFT_PREFIX)
    ? content.slice(DRAFT_PREFIX.length)
    : content;
  const next = draft ? DRAFT_PREFIX + stripped : stripped;
  if (next !== content) {
    await fs.writeFile(texPath, next, "utf-8");
  }
}
