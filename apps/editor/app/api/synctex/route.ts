import { requireProject, apiError, ApiError, projectDirFor } from "@/lib/authz";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { projectId: rawProjectId, path: fileRelativePath, ...query } = await req.json();
    if (!fileRelativePath) throw new ApiError(400, "Path parameter is required");

    const projectId = await requireProject(rawProjectId);
    const projectPath = projectDirFor(projectId);

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
      headers: {
        "Content-Type": "application/json",
        ...(process.env.COMPILER_SECRET
          ? { Authorization: `Bearer ${process.env.COMPILER_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        mode: compilerMode,
        localProjectPath: projectPath,
        projectId,
        fileRelativePath,
        ...query,
      }),
    });

    if (!response.ok) {
      throw new ApiError(response.status, "Failed to parse SyncTeX from compiler");
    }

    return Response.json(await response.json());
  } catch (error) {
    return apiError(error);
  }
}
