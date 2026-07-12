import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { requireProject } from "../../lib/authz";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Writes or updates the content of a file in the workspace.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
    content: z.string().describe("The complete file content to write"),
  }),
  approval: always(),
  async execute({ projectId, path: filePath, content }) {
    try {
      const pid = await requireProject(projectId);
      await storage.writeFile(pid, filePath, content);
      return `Successfully updated file: ${filePath}`;
    } catch (e: any) {
      return `Error writing file at ${filePath}: ${e.message}`;
    }
  },
});
