import { defineTool } from "eve/tools";
import fs from "fs/promises";
import path from "path";
import { z } from "zod";
import { getProjectPath } from "../../lib/project";

export default defineTool({
  description: "Reads the content of any file in the workspace.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file from project root"),
  }),
  async execute({ path: filePath }) {
    try {
      const projectPath = await getProjectPath();
      const resolvedPath = path.resolve(projectPath, filePath);
      return await fs.readFile(resolvedPath, "utf-8");
    } catch (e: any) {
      return `Error reading file at ${filePath}: ${e.message}`;
    }
  },
});
