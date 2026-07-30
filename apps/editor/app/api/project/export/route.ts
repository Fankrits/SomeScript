import { NextRequest } from "next/server";
import { storage, type FileNode } from "@/lib/storage";
import { requireProject, getProjectName, apiError, ApiError } from "@/lib/authz";
import JSZip from "jszip";

/** Safe, timestamped download filename — strips chars that break HTTP headers or filesystems. */
function exportFilename(projectName: string, ext: "pdf" | "zip"): string {
  const safeName = projectName.replace(/[^A-Za-z0-9 _.-]+/g, "-").trim() || "project";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return `${safeName}_${stamp}.${ext}`;
}

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
        const projectName = await getProjectName(projectId);
        return new Response(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${exportFilename(projectName, "pdf")}"`,
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
      const projectName = await getProjectName(projectId);

      return new Response(new Uint8Array(content), {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${exportFilename(projectName, "zip")}"`,
          "Content-Length": content.length.toString(),
        },
      });
    }

    throw new ApiError(400, "Invalid type parameter");
  } catch (error) {
    return apiError(error);
  }
}
