import { getProjectPath } from "@/lib/project";
import { storage, FileNode } from "@/lib/storage";
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

// Recursively gather all project files via the unified storage provider
async function getAllStorageFiles(projectId: string, nodes: FileNode[]): Promise<{ path: string; content: string }[]> {
  let files: { path: string; content: string }[] = [];

  for (const node of nodes) {
    if (node.isDir && node.children) {
      const subFiles = await getAllStorageFiles(projectId, node.children);
      files = files.concat(subFiles);
    } else if (!node.isDir) {
      // Skip placeholder keep files
      if (node.name === ".keep") continue;

      if (
        node.name.endsWith(".pdf") ||
        node.name.endsWith(".png") ||
        node.name.endsWith(".jpg") ||
        node.name.endsWith(".jpeg") ||
        node.name.endsWith(".woff2")
      ) {
        const buffer = await storage.readBinaryFile(projectId, node.path);
        files.push({
          path: node.path,
          content: `data:application/octet-stream;base64,${buffer.toString("base64")}`,
        });
      } else {
        const content = await storage.readFile(projectId, node.path);
        files.push({
          path: node.path,
          content,
        });
      }
    }
  }
  return files;
}

export async function POST(req: NextRequest) {
  try {
    const { path: fileRelativePath } = await req.json();
    if (!fileRelativePath) {
      return Response.json({ error: "Path parameter is required" }, { status: 400 });
    }

    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);

    if (!fileRelativePath.endsWith(".tex")) {
      return Response.json({ error: "Only .tex files can be compiled" }, { status: 400 });
    }

    const compilerUrl = process.env.COMPILER_URL || "http://127.0.0.1:3001";
    const isLocalCompiler =
      compilerUrl.includes("localhost") ||
      compilerUrl.includes("127.0.0.1") ||
      compilerUrl.includes("0.0.0.0");

    if (isLocalCompiler) {
      // Local mode: Compile using local filesystem path passed directly to compiler
      const response = await fetch(`${compilerUrl}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "local",
          localProjectPath: projectPath,
          fileRelativePath,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return Response.json({ error: errText || "Compiler service error" }, { status: response.status });
      }

      return new Response(response.body, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    } else {
      // Remote/Upload mode for cloud hosting
      const projectTree = await storage.listProjectFiles(projectId);
      const files = await getAllStorageFiles(projectId, projectTree);

      const response = await fetch(`${compilerUrl}/compile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "upload",
          fileRelativePath,
          files,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ logs: "Failed to parse error response" }));
        return Response.json({ error: errData.logs || "Compiler service error" }, { status: response.status });
      }

      const result = await response.json();

      if (result.success && result.pdf) {
        // Save the compiled PDF back to the project storage so the frontend can retrieve it
        const pdfRelativePath = fileRelativePath.replace(/\.tex$/, ".pdf");
        await storage.writeFile(projectId, pdfRelativePath, Buffer.from(result.pdf, "base64"));
      }

      // Return logs as plain text to match frontend stream parsing expectations
      return new Response(result.logs || "", {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      });
    }
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
