import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { compileUpload, compilerMode } from "../../lib/compile";
import { readProjectSettings } from "../../lib/project-settings";
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
        "Project-relative .tex file to compile as the root document, e.g. 'main.tex' or 'chapters/intro.tex'. Omit to compile the project's configured root document. Use the [openFile: ...] context marker when the user says 'this file' or 'the current file'.",
      ),
  }),
  async execute({ projectId, path }, ctx) {
    const requested = path?.trim();

    if (compilerMode() !== "upload") {
      return didNotRun(
        requested ?? "",
        'Compiling from chat needs the compiler in upload mode. Set COMPILER_MODE="upload" in apps/editor/.env.local and restart the dev server. The Compile button in the toolbar still works.',
      );
    }

    let texPath = requested ?? "";
    let pid: string | undefined;
    try {
      pid = await resolveToolProject(projectId, workspaceFrom(ctx));

      // An omitted path compiles the project's *configured* root document —
      // the same one the toolbar's Compile button uses. This used to hardcode
      // "main.tex", so on any project whose root is named otherwise (Main.tex,
      // thesis.tex) the model's first compile failed with "Root file not found
      // in workspace" and it then burned steps rediscovering the real name.
      texPath = requested || (await readProjectSettings(pid)).mainFilePath;

      // Checked after resolution, not just on the model's argument:
      // sanitizeProjectSettings guarantees a non-empty string, not a .tex one,
      // so a hand-edited settings file would otherwise reach the compiler.
      if (!texPath.endsWith(".tex")) {
        return didNotRun(texPath, `Cannot compile ${texPath}: only .tex files can be compiled.`);
      }

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
      // The stamp is set before the upload because compileUpload re-reads and
      // hashes every project file before the compiler ever sees it, and that is
      // the cost the throttle exists to bound. But a throw means no compile ran
      // and no log was stored, so releasing it here is what keeps the throttle
      // honest: otherwise the model's *corrective* retry gets "Already compiled
      // Ns ago. Use read-compile-log to see that result" pointing at a log that
      // does not exist, and read-compile-log answers "nothing has been compiled
      // recently". Observed costing three wasted steps and ~900 output tokens
      // on a project whose root was Main.tex.
      //
      // Only reachable with `pid` set when compileUpload threw: resolveToolProject
      // throws before it is assigned, and readProjectSettings never throws.
      if (pid !== undefined) lastCompileAt.delete(pid);
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
