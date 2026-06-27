import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { getProjectPath } from "../../lib/project";

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
      const resolvedPath = path.resolve(projectPath, filePath);
      await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fs.writeFile(resolvedPath, content, "utf-8");
      return `Successfully updated file: ${filePath}`;
    } catch (e: any) {
      return `Error writing file at ${filePath}: ${e.message}`;
    }
  },
});
