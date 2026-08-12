import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { recordRead } from "../lib/read-versions";
import { storage } from "../../lib/storage";

// Capped on characters, not lines: one LaTeX paragraph is routinely a single
// 5,000-character line, so a line budget bounds nothing. ~40k chars is ~10k
// tokens against the 128k Lite window (agent/model-config.ts).
// ponytail: flat char cap, no per-mode sizing. Raise it when a real Expert-mode
// session gets truncated on a file it needed whole.
const MAX_READ_CHARS = 40_000;

interface ReadFileOutput {
  ok: boolean;
  path: string;
  /** Already sliced and clipped — this is what the model and the card both show. */
  content: string;
  totalLines: number;
  firstLine: number;
  lastLine: number;
  truncated: boolean;
  error?: string;
}

/** `   42→text`. An arrow, not a colon: a colon collides with LaTeX content and
 *  with the `path:line:column` shape grep emits. */
function numberLines(lines: string[], firstLine: number): string {
  return lines.map((text, i) => `${String(firstLine + i).padStart(6)}→${text}`).join("\n");
}

export default defineTool({
  description:
    "Reads a file from the project and returns it with line numbers. Use offset/limit to read part of a large file instead of all of it.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
    offset: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "1-based line number to start reading from. Omit to start at line 1. Use the line number grep reported.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe("How many lines to read starting at offset. Omit to read to the end of the file."),
  }),
  async execute({ projectId, path: filePath, offset, limit }, ctx) {
    try {
      const pid = await resolveToolProject(projectId, workspaceFrom(ctx));
      const content = await storage.readFile(pid, filePath);
      // Record the FULL content, not the returned slice, so a ranged read still
      // lets write-file detect a change anywhere in the file.
      recordRead(pid, filePath, content);

      const all = content.split("\n");
      const start = Math.min(Math.max((offset ?? 1) - 1, 0), Math.max(all.length - 1, 0));
      const end = limit === undefined ? all.length : Math.min(start + limit, all.length);

      // Trim to the char budget on a line boundary, so the resume offset is exact.
      const slice: string[] = [];
      let budget = MAX_READ_CHARS;
      let truncated = end < all.length;
      for (let i = start; i < end; i++) {
        budget -= all[i].length + 1;
        if (budget < 0 && slice.length > 0) {
          truncated = true;
          break;
        }
        slice.push(all[i]);
      }

      return {
        ok: true as const,
        path: filePath,
        content: numberLines(slice, start + 1),
        totalLines: all.length,
        firstLine: start + 1,
        lastLine: start + slice.length,
        truncated,
      };
    } catch (e) {
      return {
        ok: false as const,
        path: filePath,
        content: "",
        totalLines: 0,
        firstLine: 0,
        lastLine: 0,
        truncated: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
  toModelOutput(output) {
    const out = output as ReadFileOutput;
    // A failure carries no numbered lines, which is what makes it structurally
    // distinguishable from a file whose contents happen to read like an error.
    if (!out.ok) {
      return { type: "text", value: `Error reading ${out.path}: ${out.error ?? "unknown error"}` };
    }

    // Whole file, unasked-for range: don't spend tokens saying "lines 1-12 of 12".
    const whole = out.firstLine === 1 && out.lastLine === out.totalLines;
    const header = whole
      ? ""
      : `${out.path} (lines ${out.firstLine}-${out.lastLine} of ${out.totalLines})\n`;
    const tail = out.truncated
      ? `\n\n[truncated — ${out.totalLines - out.lastLine} more lines. Call read-file again with offset=${out.lastLine + 1}.]`
      : "";

    return { type: "text", value: `${header}${out.content}${tail}` };
  },
});
