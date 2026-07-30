import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, touchProject, apiError, ApiError } from "@/lib/authz";
import { MAX_UPLOAD_BYTES, flattenFilePaths, dedupeUploadName } from "@/lib/zip";
import { checkRate } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    await checkRate("upload", 20, 60_000);
    const formData = await req.formData();
    const projectId = await requireProject(formData.get("projectId") as string | null);
    const targetDir = (formData.get("path") as string | null) ?? "";
    const files = formData.getAll("files") as File[];

    if (files.length === 0) throw new ApiError(400, "No files provided");

    const oversized = files.find((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversized) throw new ApiError(413, `"${oversized.name}" is too large`);

    const tree = await storage.listProjectFiles(projectId);
    const existingPaths = flattenFilePaths(tree);

    const saved: string[] = [];
    for (const file of files) {
      const destPath = dedupeUploadName(existingPaths, targetDir, file.name);
      existingPaths.add(destPath);
      const buffer = Buffer.from(await file.arrayBuffer());
      await storage.writeFile(projectId, destPath, buffer);
      saved.push(destPath);
    }

    await touchProject(projectId);
    return Response.json({ success: true, saved });
  } catch (error) {
    return apiError(error);
  }
}
