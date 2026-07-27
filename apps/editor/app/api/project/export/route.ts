import { NextRequest } from "next/server";
import { storage, type FileNode } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import JSZip from "jszip";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    const type = searchParams.get("type"); // "pdf" | "zip"

    if (type === "pdf") {
      // Force a fresh compile before serving — otherwise this would hand back
      // whatever's already cached, which may be stale relative to the user's
      // latest edits.
      const compileRes = await fetch(new URL("/api/compile", req.url), {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
        body: JSON.stringify({ projectId, path: "main.tex" }),
      });
      const compileLog = await compileRes.text();
      if (!compileRes.ok || !compileLog.includes("[SUCCESS]")) {
        return Response.json(
          { error: compileLog || "Compilation failed. Please check the project in the editor." },
          { status: 422 }
        );
      }

      try {
        const buffer = await storage.readBinaryFile(projectId, ".preview-cache/main.pdf");
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="project-${projectId}.pdf"`,
            "Content-Length": buffer.length.toString(),
          },
        });
      } catch {
        return Response.json({ error: "PDF preview file not found. Please compile the project first in the editor." }, { status: 404 });
      }
    }

    if (type === "zip") {
      const tree = await storage.listProjectFiles(projectId);
      const zip = new JSZip();

      const addFilesToZip = async (zipInstance: JSZip, nodes: FileNode[]) => {
        for (const node of nodes) {
          if (node.isDir && node.children) {
            const folder = zipInstance.folder(node.name);
            if (folder) {
              await addFilesToZip(folder, node.children);
            }
          } else if (!node.isDir) {
            if (node.name === ".keep") continue;
            const buffer = await storage.readBinaryFile(projectId, node.path);
            zipInstance.file(node.name, buffer);
          }
        }
      };

      await addFilesToZip(zip, tree);
      const content = await zip.generateAsync({ type: "nodebuffer" });

      return new Response(new Uint8Array(content), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="project-${projectId}.zip"`,
          "Content-Length": content.length.toString(),
        },
      });
    }

    throw new ApiError(400, "Invalid type parameter");
  } catch (error) {
    return apiError(error);
  }
}
