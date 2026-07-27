import { storage, isBinaryContent } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { NextRequest } from "next/server";

const IMAGE_MIME: Record<string, string> = {
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".svg":  "image/svg+xml",
  ".webp": "image/webp",
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    const filePath = searchParams.get("path");

    if (filePath) {
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

      // Not a recognized image/PDF extension — could still be an unlisted binary
      // format (docx, fonts, archives, ...); don't force-decode those as UTF-8.
      const buffer = await storage.readBinaryFile(projectId, filePath);
      if (isBinaryContent(buffer)) {
        return Response.json({ unsupported: true });
      }
      return Response.json({ content: buffer.toString("utf-8") });
    }

    const tree = await storage.listProjectFiles(projectId);
    return Response.json({ tree });
  } catch (error) {
    const e = error as { code?: string; message?: string; name?: string };
    if (e?.code === "ENOENT" || e?.message?.includes("ENOENT") || e?.name === "NoSuchKey") {
      return apiError(new ApiError(404, "File not found"));
    }
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = await requireProject(body.projectId);

    if (body.action === "create") {
      if (body.isDir) {
        await storage.createDirectory(projectId, body.path);
      } else {
        await storage.writeFile(projectId, body.path, "");
      }
      return Response.json({ success: true });
    }

    if (body.action === "save") {
      if (typeof body.path !== "string" || typeof body.content !== "string") {
        throw new ApiError(400, "Missing path or content");
      }
      await storage.writeFile(projectId, body.path, body.content);
      return Response.json({ success: true });
    }

    if (body.action === "move") {
      await storage.move(projectId, body.oldPath, body.newPath);
      return Response.json({ success: true });
    }

    if (body.action === "delete") {
      await storage.delete(projectId, body.path);
      return Response.json({ success: true });
    }

    throw new ApiError(400, "Invalid action");
  } catch (error) {
    return apiError(error);
  }
}
