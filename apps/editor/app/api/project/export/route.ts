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
