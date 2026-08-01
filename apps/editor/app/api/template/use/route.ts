import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { checkRate } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    await checkRate("template-use", 20, 60_000);
    const body = await req.json();
    const { templateId, projectId: rawProjectId } = body;

    if (!templateId) throw new ApiError(400, "Missing templateId");
    const projectId = await requireProject(rawProjectId);

    const srcStorageId = `templates/${templateId}`;

    await storage.copyProject(srcStorageId, projectId);

    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
