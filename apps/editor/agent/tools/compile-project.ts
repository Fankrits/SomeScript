import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject } from "../../lib/authz";
import { compileUpload, compilerMode } from "../../lib/compile";
import {
  formatCompileForModel,
  parseCompileErrors,
  type CompileError,
} from "../../lib/compile-errors";

// Each call re-reads every project file out of storage and base64s it before the
// compiler's own cache can help, so a tight tool loop is genuinely expensive.
// checkRate() isn't usable here — it top-level-imports Clerk and keys on auth(),
// neither of which works in eve's tool runtime.
// ponytail: per-process throttle, 3s so it can't block a legitimate
// write-then-verify cycle (that costs a full model round-trip). Move to Redis if
// eve ever runs more than one instance.
const lastCompileAt = new Map<string, number>();
const MIN_COMPILE_INTERVAL_MS = 3_000;

export interface CompileToolOutput {
  ok: boolean;
  path: string;
  pdfPath: string | null;
  errors: CompileError[];
  log: string;
  /** Set when the compile never ran at all (wrong mode, bad path, throttled). */
  error?: string;
}

function didNotRun(path: string, error: string): CompileToolOutput {
  return { ok: false, path, pdfPath: null, errors: [], log: "", error };
}

export default defineTool({
  description:
    "Compiles the LaTeX project with Tectonic and returns the compile log plus any errors, with their file and line number. This is the same compile the user's Compile button runs — it refreshes their PDF preview and terminal panel too. Use it when the user asks to compile or build, and once after fixing a compile error to verify the fix.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z
      .string()
      .optional()
      .describe(
        "Project-relative .tex file to compile as the root document, e.g. 'main.tex' or 'chapters/intro.tex'. Omit to compile 'main.tex'. Use the [openFile: ...] context marker when the user says 'this file' or 'the current file'.",
      ),
  }),
  async execute({ projectId, path }, ctx) {
    const texPath = path?.trim() || "main.tex";

    if (!texPath.endsWith(".tex")) {
      return didNotRun(texPath, `Cannot compile ${texPath}: only .tex files can be compiled.`);
    }

    if (compilerMode() !== "upload") {
      return didNotRun(
        texPath,
        'Compiling from chat needs the compiler in upload mode. Set COMPILER_MODE="upload" in apps/editor/.env.local and restart the dev server. The Compile button in the toolbar still works.',
      );
    }

    try {
      const pid = await resolveToolProject(projectId);

      const since = Date.now() - (lastCompileAt.get(pid) ?? 0);
      if (since < MIN_COMPILE_INTERVAL_MS) {
        return didNotRun(
          texPath,
          `Already compiled ${Math.round(since / 1000)}s ago. Use read-compile-log to see that result, or wait a moment before compiling again.`,
        );
      }
      lastCompileAt.set(pid, Date.now());

      const result = await compileUpload({
        projectId: pid,
        path: texPath,
        signal: ctx.abortSignal,
      });

      return {
        ok: result.ok,
        path: result.path,
        pdfPath: result.pdfPath,
        errors: parseCompileErrors(result.log, result.path),
        log: result.log,
      } satisfies CompileToolOutput;
    } catch (e) {
      return didNotRun(
        texPath,
        `Error compiling ${texPath}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  },
  // The model gets the errors plus a log tail; the full log still reaches the UI
  // card via the stream. See eve docs/tools/overview.mdx.
  toModelOutput(output) {
    const out = output;
    if (out.error) return { type: "text", value: out.error };

    const header = out.ok ? `Compiled ${out.path} successfully.` : `Compile of ${out.path} FAILED.`;
    const body = formatCompileForModel(out.errors, out.log);
    return { type: "text", value: body ? `${header}\n\n${body}` : header };
  },
});
