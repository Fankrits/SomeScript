import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject, touchProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { readProjectSettings, setMainFile } from "../../lib/project-settings";

interface MainFileOutput {
  ok: boolean;
  path: string;
  previousPath?: string;
  error?: string;
  /** Set on a failed read (no `path` given) so toModelOutput doesn't call it a "set" error. */
  readAttempt?: boolean;
}

export default defineTool({
  description:
    "Reports or changes the project's configured root .tex file — the one compile-project uses by default and the one shown in the project's Settings panel. Omit path to check the current value; pass path to change it.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z
      .string()
      .optional()
      .describe(
        "Project-relative .tex path to make the new main file, e.g. 'chapters/thesis.tex'. Omit to just report the current main file.",
      ),
  }),
  async execute({ projectId, path }, ctx) {
    try {
      const pid = await resolveToolProject(projectId, workspaceFrom(ctx));

      if (path === undefined) {
        const current = await readProjectSettings(pid);
        return { ok: true as const, path: current.mainFilePath };
      }

      const result = await setMainFile(pid, path);
      if (!result.ok) {
        return { ok: false as const, path, error: result.error };
      }

      await touchProject(pid);
      return {
        ok: true as const,
        path: result.mainFilePath,
        previousPath: result.previousMainFilePath,
      };
    } catch (e) {
      return {
        ok: false as const,
        path: path ?? "",
        error: e instanceof Error ? e.message : String(e),
        readAttempt: path === undefined,
      };
    }
  },
  toModelOutput(output) {
    const out = output as MainFileOutput;
    if (!out.ok) {
      return {
        type: "text",
        value: out.readAttempt
          ? `Error checking the main file: ${out.error ?? "unknown error"}`
          : `Error setting main file to ${out.path}: ${out.error ?? "unknown error"}`,
      };
    }
    return {
      type: "text",
      value:
        out.previousPath !== undefined
          ? `Set the project's main file to ${out.path} (was ${out.previousPath}).`
          : `The project's current main file is ${out.path}.`,
    };
  },
});
