import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject, touchProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { recordRead } from "../lib/read-versions";
import { storage } from "../../lib/storage";
import { notifyCollabPathsChanged } from "../../lib/collab-notify";
import { applyExactEdit, lineAtOffset } from "../../lib/edit-text";

// Same ceiling as write-file.ts / delete-file.ts: above this we skip the
// before-snapshot and the card shows "snapshot unavailable" instead of a diff.
const MAX_SNAPSHOT_BYTES = 1_000_000;

interface EditFileOutput {
  ok: boolean;
  path: string;
  before?: string | null;
  after?: string;
  created?: boolean;
  error?: string;
}

export default defineTool({
  description:
    "Replaces one exact block of text in a file, leaving the rest untouched. Use this instead of write-file for any change to an existing file — it is faster, cheaper, and cannot clobber edits the user is making elsewhere in the file.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
    oldText: z
      .string()
      .describe(
        "The exact text to replace, copied verbatim from read-file output WITHOUT the '  42→' line-number prefixes. Must appear exactly once in the file — include enough surrounding lines to make it unique.",
      ),
    newText: z.string().describe("The replacement text. Pass an empty string to delete oldText."),
  }),
  async execute({ projectId, path: filePath, oldText, newText }, ctx) {
    try {
      const pid = await resolveToolProject(projectId, workspaceFrom(ctx));

      // Deliberately no stale-read guard here (unlike write-file): this read is
      // inside execute, so anything the user typed while the model was thinking
      // is already in `before` and survives the splice. There is no window to guard.
      const before = await storage.readFile(pid, filePath);

      const edit = applyExactEdit(before, oldText, newText);
      if (!edit.ok) {
        // Each message names the recovery action — on the default Lite model that
        // is the difference between a retry and a give-up.
        const error =
          edit.reason === "empty"
            ? "oldText cannot be empty. Pass the exact text you want to replace."
            : edit.reason === "not-found"
              ? `oldText was not found in ${filePath}. Read the file again — it may have changed, or your copy may still include the "  42→" line-number prefixes.`
              : `oldText appears more than once in ${filePath}. Include more surrounding lines so it matches exactly one place.`;
        return { ok: false as const, path: filePath, error };
      }

      await storage.writeFile(pid, filePath, edit.after);
      await touchProject(pid);
      // Without this the collaboration server keeps serving its cached Y.Text and
      // reverts the edit on the next autosave debounce.
      await notifyCollabPathsChanged(pid, [filePath]);
      // Not a guard (see above) — but without it, a later write-file would compare
      // the file we just changed against a pre-edit hash and refuse a valid write.
      recordRead(pid, filePath, edit.after);

      return {
        ok: true as const,
        path: filePath,
        before: before.length > MAX_SNAPSHOT_BYTES ? null : before,
        after: edit.after,
        // Always false: present only so WriteFileCard's hasBaseline/revert branch
        // needs no special case for this tool.
        created: false,
        line: lineAtOffset(before, edit.index),
      };
    } catch (e) {
      return {
        ok: false as const,
        path: filePath,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
  toModelOutput(output) {
    const out = output as EditFileOutput & { line?: number };
    return {
      type: "text",
      value: out.ok
        ? `Edited ${out.path} — replaced 1 block at line ${out.line}.`
        : (out.error ?? `Error editing ${out.path}.`),
    };
  },
});
