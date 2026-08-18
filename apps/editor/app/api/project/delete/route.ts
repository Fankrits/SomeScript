import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, apiError } from "@/lib/authz";

export async function POST(req: NextRequest) {
  try {
    const { projectId: rawProjectId } = await req.json();
    const projectId = await requireProject(rawProjectId, { includeTrashed: true });
    await storage.delete(projectId, "");
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
