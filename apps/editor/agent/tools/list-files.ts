import { defineTool } from "eve/tools";
import { z } from "zod";
import { getProjectPath, getProjectIdFromPath } from "../../lib/project";
import { storage, type FileNode } from "../../lib/storage";

export default defineTool({
  description: "Lists all files in the project workspace recursively.",
  inputSchema: z.object({}),
  async execute() {
    try {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      
      const fileNodes = await storage.listProjectFiles(projectId);
      
      const flatten = (nodes: FileNode[]): string[] => {
        let list: string[] = [];
        for (const node of nodes) {
          if (node.isDir) {
            if (node.children) {
              list = list.concat(flatten(node.children));
            }
          } else {
            list.push(node.path);
          }
        }
        return list;
      };
      
      const filesList = flatten(fileNodes);
      if (filesList.length === 0) {
        return "The project workspace is empty.";
      }
      return `Files in the project workspace:\n${filesList.map(f => `- ${f}`).join("\n")}`;
    } catch (e: any) {
      return `Error listing project files: ${e.message}`;
    }
  },
});

