import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";
import { storage } from "@/lib/storage";
import { requireProject, touchProject, apiError, ApiError } from "@/lib/authz";

// Checked-in starter project (article template + Thai/English fonts) copied
// into every newly created project. See apps/editor/default-latex/.
const TEMPLATE_DIR = path.join(process.cwd(), "default-latex");

async function collectFiles(dir: string, relativeRoot = ""): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const relPath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path.join(dir, entry.name), relPath)));
    } else {
      files.push(relPath);
    }
  }
  return files;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = await requireProject(body.projectId);

    let relativePaths: string[];
    try {
      relativePaths = await collectFiles(TEMPLATE_DIR);
    } catch {
      throw new ApiError(500, "Default template is missing");
    }

    for (const relPath of relativePaths) {
      const content = await fs.readFile(path.join(TEMPLATE_DIR, relPath));
      await storage.writeFile(projectId, relPath, content);
    }

    await touchProject(projectId);
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
