import { defineTool } from "eve/tools";
import fs from "fs/promises";
import { z } from "zod";

export default defineTool({
  description: "Reads the content of any file in the workspace.",
  inputSchema: z.object({
    path: z.string().describe("Relative path to the file from project root"),
  }),
  async execute({ path }) {
    try {
      return await fs.readFile(path, "utf-8");
    } catch (e: any) {
      return `Error reading file at ${path}: ${e.message}`;
    }
  },
});
