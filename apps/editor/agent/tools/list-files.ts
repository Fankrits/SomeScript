import { defineTool } from "eve/tools";
import { z } from "zod";
import path from "path";
import { resolveToolProject } from "../../lib/authz";
import { workspaceFrom } from "../lib/workspace";
import { storage, type FileNode } from "../../lib/storage";

function flatten(nodes: FileNode[]): string[] {
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
}

// A `pattern` filter here rather than a separate glob tool: storage.listProjectFiles
// applies the product's exclusion rules (node_modules, .eve, .somescript, and the
// compiled PDF beside its .tex), and a second listing tool would either duplicate
// that logic or lose it. eve's own sandbox `glob` built-in stays disabled.
export default defineTool({
  description:
    "Lists the files in the project workspace recursively, optionally filtered by a glob pattern.",
  inputSchema: z.object({
    projectId: z
      .string()
      .describe("The projectId from the [projectId: ...] context marker in the conversation"),
    pattern: z
      .string()
      .optional()
      .describe(
        "Optional glob to filter the listing, matched against each file's full project-relative path. '*' does not cross '/', so use '**/*.tex' for every .tex at any depth, 'chapters/*.tex' for one folder, '**/*.{tex,bib}' for several extensions. Omit to list every file.",
      ),
  }),
  async execute({ projectId, pattern }, ctx) {
    try {
      const pid = await resolveToolProject(projectId, workspaceFrom(ctx));
      const fileNodes = await storage.listProjectFiles(pid);

      const all = flatten(fileNodes);
      if (all.length === 0) {
        return "The project workspace is empty.";
      }

      // matchesGlob returns false on a malformed pattern rather than throwing, so
      // an empty result is ambiguous between "no such files" and "bad glob" — the
      // recovery hint below is what keeps that from costing three turns.
      const filesList = pattern ? all.filter((f) => path.matchesGlob(f, pattern)) : all;
      if (filesList.length === 0) {
        const hint = pattern?.startsWith("**/")
          ? ""
          : ` try "**/${pattern}" ('*' does not match across folders), or`;
        return `No files match "${pattern}". The project has ${all.length} file${all.length === 1 ? "" : "s"} —${hint} omit pattern to see everything.`;
      }

      const header = pattern ? `Files matching "${pattern}":` : "Files in the project workspace:";
      return `${header}\n${filesList.map((f) => `- ${f}`).join("\n")}`;
    } catch (e) {
      return `Error listing project files: ${e instanceof Error ? e.message : String(e)}`;
    }
  },
});
