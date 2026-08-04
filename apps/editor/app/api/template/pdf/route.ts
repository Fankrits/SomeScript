import { NextRequest } from "next/server";
import { storage, type FileNode } from "@/lib/storage";
import { apiError, ApiError } from "@/lib/authz";
import { compileUpload } from "@/lib/compile";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get("templateId");
    if (!templateId) throw new ApiError(400, "Missing templateId parameter");

    // templateId may be:
    //  - a plain UUID  → stored under templates/{uuid}
    //  - "staging:{uuid}" → stored under template-staging/{uuid}  (preview before publish)
    const storageId = templateId.startsWith("staging:")
      ? `template-staging/${templateId.slice("staging:".length)}`
      : `templates/${templateId}`;

    // 1. Try reading pre-existing cached PDF
    const cachedPaths = [
      ".preview-cache/main.pdf",
      "main.pdf",
    ];

    for (const p of cachedPaths) {
      try {
        const existingPdf = await storage.readBinaryFile(storageId, p);
        if (existingPdf && existingPdf.length > 0) {
          return new Response(new Uint8Array(existingPdf), {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": existingPdf.length.toString(),
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      } catch {
        // Not generated yet
      }
    }

    // 2. Search if any PDF file already exists in storage before attempting re-compilation
    const files = await storage.listProjectFiles(storageId);
    const findPdf = (nodes: FileNode[]): string | null => {
      for (const node of nodes) {
        if (node.isDir && node.children) {
          const res = findPdf(node.children);
          if (res) return res;
        } else if (node.name.endsWith(".pdf")) {
          return node.path;
        }
      }
      return null;
    };
    const existingPdfPath = findPdf(files);
    if (existingPdfPath) {
      try {
        const buffer = await storage.readBinaryFile(storageId, existingPdfPath);
        if (buffer && buffer.length > 0) {
          return new Response(new Uint8Array(buffer), {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": buffer.length.toString(),
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      } catch {}
    }

    // 3. Find primary .tex file
    let texFile = "main.tex";
    const findTex = (nodes: FileNode[]): string | null => {
      for (const node of nodes) {
        if (node.isDir && node.children) {
          const res = findTex(node.children);
          if (res) return res;
        } else if (node.name.endsWith(".tex")) {
          return node.path;
        }
      }
      return null;
    };
    const foundTex = findTex(files);
    if (foundTex) texFile = foundTex;

    // 4. Compile on-demand using compileUpload only if no PDF was found
    try {
      const compileResult = await compileUpload({ projectId: storageId, path: texFile });
      if (compileResult.pdfPath) {
        const pdfBuffer = await storage.readBinaryFile(storageId, compileResult.pdfPath);
        if (pdfBuffer && pdfBuffer.length > 0) {
          // Persist to main.pdf for instant future cache hits
          try {
            await storage.writeFile(storageId, "main.pdf", pdfBuffer);
          } catch {}

          return new Response(new Uint8Array(pdfBuffer), {
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": pdfBuffer.length.toString(),
              "Cache-Control": "public, max-age=3600",
            },
          });
        }
      }
    } catch (compileErr) {
      console.warn("Template PDF compilation on-demand warning:", compileErr);
    }

    throw new ApiError(404, "Template preview PDF not available");
  } catch (error) {
    return apiError(error);
  }
}
