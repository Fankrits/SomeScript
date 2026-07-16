import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { safeZipPath, MAX_ZIP_ENTRIES, MAX_ZIP_FILE_BYTES, MAX_ZIP_TOTAL_BYTES, MAX_UPLOAD_BYTES } from "@/lib/zip";
import JSZip from "jszip";

import { checkRate } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    await checkRate("import", 5, 60_000);
    const formData = await req.formData();
    const projectId = await requireProject(formData.get("projectId") as string | null);
    const file = formData.get("file") as File | null;

    if (!file) throw new ApiError(400, "Missing zip file");
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Upload too large");

    const loadedZip = await new JSZip().loadAsync(Buffer.from(await file.arrayBuffer()));

    const entries = Object.entries(loadedZip.files);
    if (entries.length > MAX_ZIP_ENTRIES) throw new ApiError(413, "Archive has too many entries");

    let totalBytes = 0;
    for (const [relativePath, zipEntry] of entries) {
      if (relativePath.startsWith("__MACOSX") || relativePath.includes(".DS_Store")) continue;
      const safePath = safeZipPath(relativePath);
      if (!safePath) continue;

      if (zipEntry.dir) {
        await storage.createDirectory(projectId, safePath);
        continue;
      }

      const fileContent = await zipEntry.async("nodebuffer");
      if (fileContent.length > MAX_ZIP_FILE_BYTES) throw new ApiError(413, "Archive entry too large");
      totalBytes += fileContent.length;
      if (totalBytes > MAX_ZIP_TOTAL_BYTES) throw new ApiError(413, "Archive too large when decompressed");

      await storage.writeFile(projectId, safePath, fileContent);
    }

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
