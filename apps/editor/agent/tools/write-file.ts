import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { getProjectPath, getProjectIdFromPath } from "../../lib/project";
import { storage } from "../../lib/storage";

export default defineTool({
  description: "Writes or updates the content of a file in the workspace.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file from project root"),
    content: z.string().describe("The complete file content to write"),
  }),
  approval: always(),
  async execute({ path: filePath, content }) {
    try {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      await storage.writeFile(projectId, filePath, content);
      return `Successfully updated file: ${filePath}`;
    } catch (e: any) {
      return `Error writing file at ${filePath}: ${e.message}`;
    }
  },
});

