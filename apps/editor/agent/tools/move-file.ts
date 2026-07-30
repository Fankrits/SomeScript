import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject, touchProject } from "../../lib/authz";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Moves or renames a file within the workspace.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
    oldPath: z.string().describe("Current relative path of the file from project root"),
    newPath: z.string().describe("New relative path for the file from project root"),
  }),
  async execute({ projectId, oldPath, newPath }) {
    try {
      const pid = await resolveToolProject(projectId);
      await storage.move(pid, oldPath, newPath);
      await touchProject(pid);
      return { ok: true as const, oldPath, newPath };
    } catch (e) {
      return { ok: false as const, oldPath, newPath, error: e instanceof Error ? e.message : String(e) };
    }
  },
  toModelOutput(output) {
    const out = output as { ok: boolean; oldPath: string; newPath: string; error?: string };
    return {
      type: "text",
      value: out.ok
        ? `Successfully moved ${out.oldPath} to ${out.newPath}`
        : `Error moving ${out.oldPath} to ${out.newPath}: ${out.error ?? "unknown error"}`,
    };
  },
});
