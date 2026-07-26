import { storage } from "@/lib/storage";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import { readTasks, sanitizeTasks, TASKS_PATH } from "@/lib/tasks";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    return Response.json({ tasks: await readTasks(projectId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = await requireProject(body.projectId);
    if (!Array.isArray(body.tasks)) throw new ApiError(400, "Missing tasks");

    // ponytail: whole-list overwrite, last writer wins — two tabs on one project can
    // clobber. Send the last-read mtime and 409 on mismatch if multi-tab becomes real.
    await storage.writeFile(projectId, TASKS_PATH, JSON.stringify(sanitizeTasks(body.tasks)));
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
