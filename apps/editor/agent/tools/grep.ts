import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { buildSearchPattern } from "../../lib/search-pattern";
import { searchFiles, type FileMatch } from "../../lib/search-files";

// Overrides eve's sandbox-backed `grep` built-in (same slug) rather than sitting
// beside it: the built-in searches the ephemeral sandbox FS, this searches the
// system of record via lib/storage, which is what the compiler and the live
// preview read. Same reasoning as the disableTool() files next to this one.

/** Matches are capped hard: this is the model's context budget, not a UI list. */
const MAX_MATCHES = 200;

/**
 * One long LaTeX paragraph is routinely a single 5,000-character line, so an
 * unclipped match line can cost more context than the file it came from.
 * Clipping lives here and never in lib/search-files.ts — the Search panel feeds
 * the full line back as a staleness check when replacing.
 */
const MAX_MATCH_LINE_CHARS = 200;

function clipAround(text: string, column: number, length: number): string {
  if (text.length <= MAX_MATCH_LINE_CHARS) return text;

  const pad = Math.max(0, Math.floor((MAX_MATCH_LINE_CHARS - length) / 2));
  const start = Math.max(0, column - pad);
  const end = Math.min(text.length, start + MAX_MATCH_LINE_CHARS);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

interface GrepOutput {
  ok: boolean;
  query: string;
  matches: FileMatch[];
  filesSearched: number;
  truncated: boolean;
  error?: string;
}

export default defineTool({
  description:
    "Searches the text of every file in the project for a string or regex and returns each match as path:line:column. Use this instead of reading files one by one when you need to find where something is defined or used — a \\label, a \\cite key, a macro, a package option, a phrase.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    query: z
      .string()
      .describe("The text to search for. Treated literally unless useRegex is true."),
    path: z
      .string()
      .optional()
      .describe(
        "Optional glob limiting the search, matched against each file's full project-relative path. '*' does not cross '/', so use '**/*.tex' for every .tex at any depth, 'chapters/*.tex' for one folder, '**/*.{tex,bib}' for several extensions. Omit to search every text file.",
      ),
    useRegex: z
      .boolean()
      .optional()
      .describe("Treat query as a JavaScript regular expression. Default false."),
    matchCase: z.boolean().optional().describe("Case-sensitive search. Default false."),
  }),
  async execute({ projectId, query, path: pathGlob, useRegex, matchCase }, ctx) {
    const empty = { query, matches: [], filesSearched: 0, truncated: false };
    try {
      const pid = await resolveToolProject(projectId, workspaceFrom(ctx));
      // matchWholeWord is deliberately not exposed: \b around a backslash-prefixed
      // control sequence (\cite, \section) behaves in ways that surprise the model,
      // and that is most of what anyone greps a LaTeX project for. useRegex covers
      // the rare real need.
      const pattern = buildSearchPattern(query, {
        matchCase: matchCase ?? false,
        matchWholeWord: false,
        useRegex: useRegex ?? false,
      });
      const result = await searchFiles(pid, pattern, { pathGlob, maxResults: MAX_MATCHES });
      return { ok: true as const, query, ...result };
    } catch (e) {
      // buildSearchPattern throws ApiError with model-readable text
      // ("Invalid regular expression", "Pattern too complex").
      return { ok: false as const, ...empty, error: e instanceof Error ? e.message : String(e) };
    }
  },
  toModelOutput(output) {
    const out = output as GrepOutput;
    if (!out.ok) return { type: "text", value: out.error ?? "Search failed." };

    const scope = out.filesSearched === 1 ? "1 file" : `${out.filesSearched} files`;
    if (out.matches.length === 0) {
      return { type: "text", value: `No matches for "${out.query}" — searched ${scope}.` };
    }

    const fileCount = new Set(out.matches.map((m) => m.path)).size;
    const header = `${out.matches.length} match${out.matches.length === 1 ? "" : "es"} in ${fileCount === 1 ? "1 file" : `${fileCount} files`} for "${out.query}".`;
    // Column is reported 1-based to match the line number; a 0 would read as a bug.
    const lines = out.matches.map(
      (m) =>
        `${m.path}:${m.line}:${m.column + 1}  ${clipAround(m.text, m.column, m.length).trim()}`,
    );
    const tail = out.truncated
      ? `\n\n(stopped at ${MAX_MATCHES} matches — narrow the query or pass path)`
      : "";

    return { type: "text", value: `${header}\n\n${lines.join("\n")}${tail}` };
  },
});
