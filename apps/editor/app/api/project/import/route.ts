import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import JSZip from "jszip";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId") as string;
    const file = formData.get("file") as File | null;

    if (!projectId) {
      return Response.json({ error: "Missing projectId" }, { status: 400 });
    }
    if (!file) {
      return Response.json({ error: "Missing zip file" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const zip = new JSZip();
    const loadedZip = await zip.loadAsync(buffer);

    for (const [relativePath, zipEntry] of Object.entries(loadedZip.files)) {
      // Ignore macOS system files/folders and other junk
      if (
        relativePath.startsWith("__MACOSX") ||
        relativePath.includes(".DS_Store") ||
        relativePath.includes("..")
      ) {
        continue;
      }

      if (zipEntry.dir) {
        await storage.createDirectory(projectId, relativePath);
      } else {
        const fileContent = await zipEntry.async("nodebuffer");
        await storage.writeFile(projectId, relativePath, fileContent);
      }
    }

    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Import zip files error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
