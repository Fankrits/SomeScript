import { defineTool } from "eve/tools";
import { z } from "zod";
import { getProjectPath, getProjectIdFromPath } from "../../lib/project";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Reads the content of any file in the workspace.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file from project root"),
  }),
  async execute({ path: filePath }) {
    try {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      return await storage.readFile(projectId, filePath);
    } catch (e: any) {
      return `Error reading file at ${filePath}: ${e.message}`;
    }
  },
});

