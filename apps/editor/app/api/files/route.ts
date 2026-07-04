import { getProjectPath, setProjectPath, getProjectIdFromPath } from "@/lib/project";
import { storage } from "@/lib/storage";
import { NextRequest } from "next/server";
import path from "path";


export async function GET(req: NextRequest) {
  console.log("[FILES API] GET request received");
  try {
    console.log("[FILES API] Fetching project path...");
    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);
    console.log("[FILES API] Project path:", projectPath, "Project ID:", projectId);
    
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (filePath) {
      console.log("[FILES API] Reading file:", filePath);

      const IMAGE_MIME: Record<string, string> = {
        ".png":  "image/png",
        ".jpg":  "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif":  "image/gif",
        ".svg":  "image/svg+xml",
        ".webp": "image/webp",
      };
      const ext = filePath.includes(".") ? `.${filePath.split(".").pop()!.toLowerCase()}` : "";
      const imageMime = IMAGE_MIME[ext];

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

      if (imageMime) {
        const buffer = await storage.readBinaryFile(projectId, filePath);
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": imageMime,
            "Content-Length": buffer.length.toString(),
            "Cache-Control": "no-store",
          },
        });
      }

      const content = await storage.readFile(projectId, filePath);
      console.log("[FILES API] File content fetched successfully");
      return Response.json({ content });
    }

    // List file tree via our unified storage client
    console.log("[FILES API] Listing project files from storage...");
    const tree = await storage.listProjectFiles(projectId);
    console.log("[FILES API] Listing success. Tree nodes:", tree.length);
    const relativePath = path.relative(process.cwd(), projectPath) || ".";
    return Response.json({ tree, projectPath: relativePath });
  } catch (error: any) {
    console.error("[FILES API] Error in GET:", error.message);
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

    // Move file or folder
    if (body.action === "move") {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      
      await storage.move(projectId, body.oldPath, body.newPath);
      return Response.json({ success: true });
    }

    // Delete file or folder
    if (body.action === "delete") {
      const projectPath = await getProjectPath();
      const projectId = getProjectIdFromPath(projectPath);
      
      await storage.delete(projectId, body.path);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
