import { getProjectPath, getProjectIdFromPath } from "@/lib/project";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { path: fileRelativePath } = await req.json();
    if (!fileRelativePath) {
      return Response.json({ error: "Path parameter is required" }, { status: 400 });
    }

    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);

    const compilerUrl = process.env.COMPILER_URL || "http://127.0.0.1:3001";
    const defaultMode =
      compilerUrl.includes("localhost") ||
      compilerUrl.includes("127.0.0.1") ||
      compilerUrl.includes("0.0.0.0")
        ? "local"
        : "upload";
    const compilerMode = process.env.COMPILER_MODE || defaultMode;

    const response = await fetch(`${compilerUrl}/synctex`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: compilerMode,
        localProjectPath: projectPath,
        projectId,
        fileRelativePath,
      }),
    });

    if (!response.ok) {
      return Response.json({ error: "Failed to parse SyncTeX from compiler" }, { status: response.status });
    }

    const data = await response.json();
    return Response.json(data);
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
