import { defineTool } from "eve/tools";
import { z } from "zod";
import { requireProject } from "../../lib/authz";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Reads the content of any file in the workspace.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
    path: z.string().describe("Relative path to the file from project root"),
  }),
  async execute({ projectId, path: filePath }) {
    try {
      const pid = await requireProject(projectId);
      return await storage.readFile(pid, filePath);
    } catch (e: any) {
      return `Error reading file at ${filePath}: ${e.message}`;
    }
  },
});
