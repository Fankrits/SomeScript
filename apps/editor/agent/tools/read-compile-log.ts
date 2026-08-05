import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject } from "../../lib/authz";
import { compileLogKey, type StoredCompileLog } from "../../lib/compile";
import {
  formatCompileForModel,
  parseCompileErrors,
  type CompileError,
} from "../../lib/compile-errors";
import { redisGet } from "../../lib/redis";

export interface ReadCompileLogOutput {
  ok: boolean;
  path: string;
  pdfPath: string | null;
  errors: CompileError[];
  log: string;
  /** How long ago that compile ran. The model must weigh this before acting. */
  ageSeconds: number;
  /** Set when there was no log to read. */
  error?: string;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${Math.round(seconds / 3600)}h`;
}

export default defineTool({
  description:
    "Reads the log from the most recent compile of this project — the same output the user sees in their terminal panel, whether they pressed Compile themselves or the agent ran compile-project. Returns the errors with file and line numbers, plus how old the log is. Use this when the user asks about an error they are already looking at, instead of recompiling.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
  }),
  async execute({ projectId }) {
    try {
      const pid = await resolveToolProject(projectId);
      const raw = await redisGet(compileLogKey(pid));

      if (!raw) {
        return {
          ok: false,
          path: "",
          pdfPath: null,
          errors: [],
          log: "",
          ageSeconds: 0,
          error:
            "No compile log is stored for this project — nothing has been compiled recently. Run compile-project to produce one.",
        } satisfies ReadCompileLogOutput;
      }

      const stored = JSON.parse(raw) as StoredCompileLog;
      return {
        ok: stored.ok,
        path: stored.path,
        pdfPath: stored.pdfPath,
        errors: parseCompileErrors(stored.log, stored.path),
        log: stored.log,
        ageSeconds: Math.max(0, Math.round((Date.now() - stored.at) / 1000)),
      } satisfies ReadCompileLogOutput;
    } catch (e) {
      return {
        ok: false,
        path: "",
        pdfPath: null,
        errors: [],
        log: "",
        ageSeconds: 0,
        error: `Error reading the compile log: ${e instanceof Error ? e.message : String(e)}`,
      } satisfies ReadCompileLogOutput;
    }
  },
  // Age goes first and deliberately loud: a stored log describes the files as they
  // were, so acting on line numbers from a stale one means "fixing" errors that
  // have already been edited away.
  toModelOutput(output) {
    const out = output as ReadCompileLogOutput;
    if (out.error) return { type: "text", value: out.error };

    const header =
      `Compile log for ${out.path} — ${formatAge(out.ageSeconds)} old, ` +
      `${out.ok ? "succeeded" : "failed"}. ` +
      `If any file has changed since, run compile-project instead of trusting these line numbers.`;
    const body = formatCompileForModel(out.errors, out.log);
    return { type: "text", value: body ? `${header}\n\n${body}` : header };
  },
});
