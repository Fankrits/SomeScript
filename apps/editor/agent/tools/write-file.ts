import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject, touchProject } from "../../lib/authz";
import { storage } from "../../lib/storage";
import { notifyCollabPathsChanged } from "../../lib/collab-notify";

// Above this size we skip the before-snapshot: the review card then shows a
// "snapshot unavailable" note and disables revert instead of diffing a huge doc.
// ponytail: fixed 1MB ceiling, raise if large-file revert becomes a real need.
const MAX_SNAPSHOT_BYTES = 1_000_000;

function isNotFound(e: unknown): boolean {
  const err = e as { code?: string; message?: string; name?: string };
  return (
    err?.code === "ENOENT" || Boolean(err?.message?.includes("ENOENT")) || err?.name === "NoSuchKey"
  );
}

export default defineTool({
  description: "Writes or updates the content of a file in the workspace.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
    content: z.string().describe("The complete file content to write"),
  }),
  async execute({ projectId, path: filePath, content }) {
    try {
      const pid = await resolveToolProject(projectId);

      // Snapshot the current content before overwriting so the UI can diff and revert.
      // `before === null && created` -> new file (revert = delete).
      // `before === null && !created` -> existed but too large / unreadable (revert unavailable).
      let before: string | null = null;
      let created = false;
      try {
        before = await storage.readFile(pid, filePath);
        if (before.length > MAX_SNAPSHOT_BYTES) before = null;
      } catch (readErr) {
        if (isNotFound(readErr)) created = true;
        // Non-not-found read error: leave before=null, created=false so revert stays disabled.
      }

      await storage.writeFile(pid, filePath, content);
      await touchProject(pid);
      await notifyCollabPathsChanged(pid, [filePath]);
      return { ok: true as const, path: filePath, before, created };
    } catch (e) {
      return {
        ok: false as const,
        path: filePath,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
  // The model only needs the outcome line; the full object (incl. `before`) still
  // reaches the UI via the stream. See eve docs/tools/overview.mdx.
  toModelOutput(output) {
    const out = output as { ok: boolean; path: string; error?: string };
    return {
      type: "text",
      value: out.ok
        ? `Successfully updated file: ${out.path}`
        : `Error writing file at ${out.path}: ${out.error ?? "unknown error"}`,
    };
  },
});
