import { getProjectPath, setProjectPath } from "@/lib/project";
import fs from "fs/promises";
import { NextRequest } from "next/server";
import path from "path";

// Exclude build artifacts and node modules from tree listing
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".eve",
  ".workflow-data",
]);

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

async function getFileTree(dirPath: string, relativeRoot = ""): Promise<FileNode[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (EXCLUDED_DIRS.has(entry.name)) {
      continue;
    }

    const relPath = relativeRoot ? `${relativeRoot}/${entry.name}` : entry.name;

    if (entry.isDirectory()) {
      const children = await getFileTree(path.join(dirPath, entry.name), relPath);
      nodes.push({
        children,
        isDir: true,
        name: entry.name,
        path: relPath,
      });
    } else {
      nodes.push({
        isDir: false,
        name: entry.name,
        path: relPath,
      });
    }
  }

  // Sort directories first, then files alphabetically
  return nodes.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.name.localeCompare(b.name);
  });
}

export async function GET(req: NextRequest) {
  try {
    const projectPath = await getProjectPath();
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (filePath) {
      // Read file content
      const resolvedPath = path.resolve(projectPath, filePath);
      // Security check: ensure path is within the project workspace
      if (!resolvedPath.startsWith(projectPath)) {
        return Response.json({ error: "Access denied" }, { status: 403 });
      }

      const content = await fs.readFile(resolvedPath, "utf-8");
      return Response.json({ content });
    }

    // List file tree
    const tree = await getFileTree(projectPath);
    return Response.json({ tree, projectPath });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { path: newPath } = await req.json();
    const resolved = await setProjectPath(newPath);
    return Response.json({ success: true, projectPath: resolved });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
