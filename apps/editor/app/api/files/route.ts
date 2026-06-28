import { getProjectPath, setProjectPath } from "@/lib/project";
import { storage } from "@/lib/storage";
import { NextRequest } from "next/server";
import path from "path";

// Helper to extract the projectId from the active project path
function getProjectIdFromPath(projectPath: string): string {
  const parts = projectPath.split(path.sep);
  const projectsIndex = parts.indexOf("projects");
  if (projectsIndex !== -1 && projectsIndex < parts.length - 1) {
    return parts[projectsIndex + 1];
  }
  return "default";
}

export async function GET(req: NextRequest) {
  try {
    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (filePath) {
      if (filePath.endsWith(".pdf")) {
        const buffer = await storage.readBinaryFile(projectId, filePath);
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Length": buffer.length.toString(),
            "Accept-Ranges": "bytes",
          },
        });
      }

      const content = await storage.readFile(projectId, filePath);
      return Response.json({ content });
    }

    // List file tree via our unified storage client
    const tree = await storage.listProjectFiles(projectId);
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
      const projectId = getProjectIdFromPath(resolved);

      // Seed default main.tex if it doesn't exist (crucial for newly created projects from dashboard)
      try {
        await storage.readFile(projectId, "main.tex");
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
        await storage.writeFile(projectId, "main.tex", defaultTemplate);
      }

      const relativePath = path.relative(process.cwd(), resolved) || ".";
      return Response.json({ success: true, projectPath: relativePath });
    }
    
    // Create file or folder
    if (body.action === "create") {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      
      if (body.isDir) {
        await storage.createDirectory(projectId, body.path);
      } else {
        await storage.writeFile(projectId, body.path, ""); // create empty file
      }
      return Response.json({ success: true });
    }

    // Save edited file content
    if (body.action === "save") {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      
      await storage.writeFile(projectId, body.path, body.content);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
