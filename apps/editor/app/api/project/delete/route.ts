import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";

export async function POST(req: NextRequest) {
  try {
    const { projectId } = await req.json();

    if (!projectId) {
      return Response.json({ error: "Missing projectId" }, { status: 400 });
    }

    // Call storage delete with empty path to delete all files under projects/projectId/
    await storage.delete(projectId, "");
    return Response.json({ success: true });
  } catch (error: any) {
    console.error("Delete files error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
