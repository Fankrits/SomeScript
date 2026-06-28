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

      if (filePath.endsWith(".pdf")) {
        const buffer = await fs.readFile(resolvedPath);
        return new Response(buffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": buffer.length.toString(),
            "Accept-Ranges": "bytes",
          },
        });
      }

      const content = await fs.readFile(resolvedPath, "utf-8");
      return Response.json({ content });
    }

    // List file tree
    const tree = await getFileTree(projectPath);
    const relativePath = path.relative(process.cwd(), projectPath) || ".";
    return Response.json({ tree, projectPath: relativePath });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Switch project path
    if (body.path && !body.action) {
      const resolved = await setProjectPath(body.path);

      // Seed default main.tex if it doesn't exist (crucial for newly created projects from dashboard)
      const mainTexPath = path.join(resolved, "main.tex");
      try {
        await fs.access(mainTexPath);
      } catch {
        const defaultTemplate = `\\documentclass[11pt, a4paper]{article}

\\usepackage[utf8]{inputenc}
\\usepackage[margin=1in]{geometry}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{\\textbf{New LaTeX Project}}
\\author{Author}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Welcome to your new LaTeX project! Describe what you want the AI assistant to write or edit, and click compile to generate a preview.

\\end{document}
`;
        await fs.mkdir(path.dirname(mainTexPath), { recursive: true });
        await fs.writeFile(mainTexPath, defaultTemplate, "utf-8");
      }

      const relativePath = path.relative(process.cwd(), resolved) || ".";
      return Response.json({ success: true, projectPath: relativePath });
    }
    
    // Create file or folder
    if (body.action === "create") {
      const projectPath = await getProjectPath();
      const resolvedPath = path.resolve(projectPath, body.path);
      
      if (!resolvedPath.startsWith(projectPath)) {
        return Response.json({ error: "Access denied" }, { status: 403 });
      }
      
      if (body.isDir) {
        await fs.mkdir(resolvedPath, { recursive: true });
      } else {
        await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
        await fs.writeFile(resolvedPath, "", "utf-8"); // empty file
      }
      return Response.json({ success: true });
    }

    // Save edited file content
    if (body.action === "save") {
      const projectPath = await getProjectPath();
      const resolvedPath = path.resolve(projectPath, body.path);
      
      if (!resolvedPath.startsWith(projectPath)) {
        return Response.json({ error: "Access denied" }, { status: 403 });
      }
      
      await fs.writeFile(resolvedPath, body.content, "utf-8");
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
