import { NextRequest } from "next/server";
import { storage, findFileByExtension } from "@/lib/storage";
import { apiError, ApiError } from "@/lib/authz";
import { renderPdfThumbnail } from "@/lib/pdf-thumbnail";

const THUMBNAIL_CACHE_PATH = ".preview-cache/thumbnail.png";

async function findPdfBuffer(storageId: string): Promise<Buffer | null> {
  for (const p of [".preview-cache/main.pdf", "main.pdf"]) {
    try {
      const buf = await storage.readBinaryFile(storageId, p);
      if (buf && buf.length > 0) return buf;
    } catch {
      // Not generated yet
    }
  }

  const files = await storage.listProjectFiles(storageId);
  const existingPdfPath = findFileByExtension(files, ".pdf");
  if (existingPdfPath) {
    try {
      const buf = await storage.readBinaryFile(storageId, existingPdfPath);
      if (buf && buf.length > 0) return buf;
    } catch {}
  }

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get("templateId");
    if (!templateId) throw new ApiError(400, "Missing templateId parameter");

    const storageId = templateId.startsWith("staging:")
      ? `template-staging/${templateId.slice("staging:".length)}`
      : `templates/${templateId}`;

    try {
      const cachedThumb = await storage.readBinaryFile(storageId, THUMBNAIL_CACHE_PATH);
      if (cachedThumb && cachedThumb.length > 0) {
        return new Response(new Uint8Array(cachedThumb), {
          headers: {
            "Content-Type": "image/png",
            "Content-Length": cachedThumb.length.toString(),
            "Cache-Control": "public, max-age=3600",
          },
        });
      }
    } catch {
      // Not generated yet
    }

    const pdfBuffer = await findPdfBuffer(storageId);
    if (!pdfBuffer) throw new ApiError(404, "Template preview PDF not available");

    const thumbnail = await renderPdfThumbnail(pdfBuffer);

    try {
      await storage.writeFile(storageId, THUMBNAIL_CACHE_PATH, thumbnail);
    } catch {}

    return new Response(new Uint8Array(thumbnail), {
      headers: {
        "Content-Type": "image/png",
        "Content-Length": thumbnail.length.toString(),
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
