// Picks a unique LaTeX root document out of files known to contain
// \documentclass. Only the root document has one; \input/\include'd chapters
// don't. Ambiguous (0 or 2+ matches) returns null rather than guessing wrong.
export function pickDetectedMainFile(texFiles: string[], documentclassMatches: string[]): string | null {
  const candidates = documentclassMatches.filter((p) => texFiles.includes(p));
  return candidates.length === 1 ? candidates[0] : null;
}
