import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject, touchProject } from "../../lib/authz";
import { storage } from "../../lib/storage";
import { notifyCollabPathsChanged } from "../../lib/collab-notify";

// Same cap as write-file.ts: above this we skip the snapshot rather than
// restoring a huge file's content back into the UI on revert.
const MAX_SNAPSHOT_BYTES = 1_000_000;

function isNotFound(e: unknown): boolean {
  const err = e as { code?: string; message?: string; name?: string };
  return (
    err?.code === "ENOENT" ||
    Boolean(err?.message?.includes("ENOENT")) ||
    err?.name === "NoSuchKey"
  );
}

export default defineTool({
  description: "Deletes a file from the workspace.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
  }),
  async execute({ projectId, path: filePath }) {
    try {
      const pid = await resolveToolProject(projectId);

      // Snapshot the current content before deleting so the UI can restore it on revert.
      let before: string | null = null;
      let existed = true;
      try {
        before = await storage.readFile(pid, filePath);
        if (before.length > MAX_SNAPSHOT_BYTES) before = null;
      } catch (readErr) {
        if (isNotFound(readErr)) existed = false;
      }

      await storage.delete(pid, filePath);
      await touchProject(pid);
      await notifyCollabPathsChanged(pid, [filePath]);
      return { ok: true as const, path: filePath, before, existed };
    } catch (e) {
      return { ok: false as const, path: filePath, error: e instanceof Error ? e.message : String(e) };
    }
  },
  toModelOutput(output) {
    const out = output as { ok: boolean; path: string; existed?: boolean; error?: string };
    return {
      type: "text",
      value: out.ok
        ? out.existed === false
          ? `${out.path} did not exist; nothing to delete.`
          : `Successfully deleted file: ${out.path}`
        : `Error deleting file at ${out.path}: ${out.error ?? "unknown error"}`,
    };
  },
});
