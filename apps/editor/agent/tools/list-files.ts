import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveToolProject } from "../../lib/authz";
import { storage, type FileNode } from "../../lib/storage";

export default defineTool({
  description: "Lists all files in the project workspace recursively.",
  inputSchema: z.object({
    projectId: z.string().describe("The projectId from the [projectId: ...] context marker in the conversation"),
  }),
  async execute({ projectId }) {
    try {
      const pid = await resolveToolProject(projectId);
      const fileNodes = await storage.listProjectFiles(pid);
      
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
    } catch (e) {
      return `Error listing project files: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
