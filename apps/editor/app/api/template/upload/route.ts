import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { apiError, ApiError } from "@/lib/authz";
import { safeZipPath, stripCommonZipRoot, MAX_ZIP_ENTRIES, MAX_ZIP_FILE_BYTES, MAX_ZIP_TOTAL_BYTES, MAX_UPLOAD_BYTES } from "@/lib/zip";
import { compileUpload } from "@/lib/compile";
import JSZip from "jszip";
import { checkRate } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    await checkRate("template-upload", 10, 60_000);
    const formData = await req.formData();
    const templateId = formData.get("templateId") as string | null;
    const file = formData.get("file") as File | null;

    if (!templateId || templateId.trim() === "") throw new ApiError(400, "Missing templateId");
    if (!file) throw new ApiError(400, "Missing zip file");
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Upload too large");

    const targetStorageId = `templates/${templateId}`;
    const loadedZip = await new JSZip().loadAsync(Buffer.from(await file.arrayBuffer()));

    const entries = Object.entries(loadedZip.files);
    if (entries.length > MAX_ZIP_ENTRIES) throw new ApiError(413, "Archive has too many entries");

    // Strip a single top-level wrapper folder (common in zips exported from Overleaf,
    // Finder, etc.) so the template stores what the uploader sees inside the zip,
    // not the zip's own incidental folder name.
    const rootPrefix = stripCommonZipRoot(
      entries
        .filter(([name]) => !name.startsWith("__MACOSX") && !name.includes(".DS_Store"))
        .map(([name]) => safeZipPath(name))
        .filter((p): p is string => p !== null)
    );

    let totalBytes = 0;
    let primaryTex = "main.tex";

    for (const [relativePath, zipEntry] of entries) {
      if (relativePath.startsWith("__MACOSX") || relativePath.includes(".DS_Store")) continue;
      let safePath = safeZipPath(relativePath);
      if (!safePath) continue;
      if (rootPrefix) {
        if (safePath === rootPrefix) continue;
        if (safePath.startsWith(`${rootPrefix}/`)) safePath = safePath.slice(rootPrefix.length + 1);
        if (!safePath) continue; // the wrapper folder's own entry (trailing-slash form)
      }

      if (zipEntry.dir) {
        await storage.createDirectory(targetStorageId, safePath);
        continue;
      }

      const fileContent = await zipEntry.async("nodebuffer");
      if (fileContent.length > MAX_ZIP_FILE_BYTES) throw new ApiError(413, "Archive entry too large");
      totalBytes += fileContent.length;
      if (totalBytes > MAX_ZIP_TOTAL_BYTES) throw new ApiError(413, "Archive too large when decompressed");

      await storage.writeFile(targetStorageId, safePath, fileContent);

      if (safePath.endsWith(".tex")) {
        if (safePath === "main.tex" || primaryTex === "main.tex") {
          primaryTex = safePath;
        }
      }
    }

    // Compile once in the background — fire-and-forget so the upload responds
    // immediately. First-time Tectonic runs can take 60s+ downloading packages.
    // main.pdf will be available for the preview endpoint once compilation finishes.
    void (async () => {
      try {
        const compileResult = await compileUpload({ projectId: targetStorageId, path: primaryTex });
        if (compileResult.pdfPath) {
          const pdfBuf = await storage.readBinaryFile(targetStorageId, compileResult.pdfPath);
          if (pdfBuf && pdfBuf.length > 0) {
            await storage.writeFile(targetStorageId, "main.pdf", pdfBuf);
          }
        }
      } catch (compileErr) {
        console.warn("Background template PDF compilation warning:", compileErr);
      }
    })();

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
