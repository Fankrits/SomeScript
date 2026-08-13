import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { readIndex, sanitizeIndex, indexPath } from "@/lib/eve-threads-storage";
import { storage } from "@/lib/storage";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthorized");
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    return Response.json({ index: await readIndex(userId, projectId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthorized");
    const body = await req.json();
    const projectId = await requireProject(body.projectId);

    // ponytail: whole-index overwrite, last writer wins — two tabs on one project can
    // clobber each other's list. Same tradeoff apps/editor/app/api/tasks/route.ts
    // already accepts; add a version check if multi-tab becomes real.
    const index = sanitizeIndex(body.index);
    await storage.writeFile(projectId, indexPath(userId), JSON.stringify(index));
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
