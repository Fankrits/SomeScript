import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { apiError, ApiError } from "@/lib/authz";
import { safeZipPath, stripCommonZipRoot, MAX_ZIP_ENTRIES, MAX_ZIP_FILE_BYTES, MAX_ZIP_TOTAL_BYTES, MAX_UPLOAD_BYTES } from "@/lib/zip";
import { compileUpload } from "@/lib/compile";
import JSZip from "jszip";
import { checkRate } from "@/lib/rate-limit";
import { randomUUID } from "crypto";

/**
 * POST /api/template/preview
 *
 * Accepts a .zip file (same format as /api/template/upload), extracts it into a
 * short-lived staging storage bucket (template-staging/{tempId}/), compiles it
 * with Tectonic, and stores the resulting main.pdf there.
 *
 * Returns { tempId } so the caller can poll /api/template/pdf?templateId=template-staging/{tempId}
 * to retrieve the compiled PDF.
 *
 * The staging bucket is intentionally ephemeral — it is overwritten on each
 * preview attempt and cleaned up when the final publishTemplate action copies
 * the files to the permanent templates/{templateId}/ bucket.
 */
export async function POST(req: NextRequest) {
  try {
    await checkRate("template-preview", 15, 60_000);
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) throw new ApiError(400, "Missing zip file");
    if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(413, "Upload too large");

    const tempId = randomUUID();
    const stagingStorageId = `template-staging/${tempId}`;

    const loadedZip = await new JSZip().loadAsync(Buffer.from(await file.arrayBuffer()));
    const entries = Object.entries(loadedZip.files);
    if (entries.length > MAX_ZIP_ENTRIES) throw new ApiError(413, "Archive has too many entries");

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
        await storage.createDirectory(stagingStorageId, safePath);
        continue;
      }

      const fileContent = await zipEntry.async("nodebuffer");
      if (fileContent.length > MAX_ZIP_FILE_BYTES) throw new ApiError(413, "Archive entry too large");
      totalBytes += fileContent.length;
      if (totalBytes > MAX_ZIP_TOTAL_BYTES) throw new ApiError(413, "Archive too large when decompressed");

      await storage.writeFile(stagingStorageId, safePath, fileContent);

      if (safePath.endsWith(".tex")) {
        if (safePath === "main.tex" || primaryTex === "main.tex") {
          primaryTex = safePath;
        }
      }
    }

    // Compile synchronously so the client gets the result immediately
    const compileResult = await compileUpload({ projectId: stagingStorageId, path: primaryTex });

    if (!compileResult.ok || !compileResult.pdfPath) {
      return Response.json(
        { ok: false, tempId, log: compileResult.log || "Compilation failed — check your LaTeX for errors." },
        { status: 422 }
      );
    }

    // Copy the compiled PDF to main.pdf so the pdf route can find it instantly
    const pdfBuf = await storage.readBinaryFile(stagingStorageId, compileResult.pdfPath);
    if (pdfBuf && pdfBuf.length > 0) {
      await storage.writeFile(stagingStorageId, "main.pdf", pdfBuf);
    }

    return Response.json({ ok: true, tempId });
  } catch (error) {
    return apiError(error);
  }
}
