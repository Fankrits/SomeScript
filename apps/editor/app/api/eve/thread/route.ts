import { NextRequest } from "next/server";
import { requireProjectAndUser, apiError, ApiError } from "@/lib/authz";
import {
  readThreadSnapshot,
  sanitizeThreadSnapshot,
  threadPath,
  HISTORY_VERSION,
} from "@/lib/eve-threads-storage";
import { storage } from "@/lib/storage";

function requireThreadId(searchParams: URLSearchParams): string {
  const threadId = searchParams.get("threadId");
  if (!threadId) throw new ApiError(400, "Missing threadId");
  return threadId;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { projectId, userId } = await requireProjectAndUser(searchParams.get("projectId"));
    const threadId = requireThreadId(searchParams);
    return Response.json({ snapshot: await readThreadSnapshot(userId, projectId, threadId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, userId } = await requireProjectAndUser(body.projectId);
    if (!body.threadId) throw new ApiError(400, "Missing threadId");

    const snapshot = sanitizeThreadSnapshot({
      version: HISTORY_VERSION,
      events: body.events,
      sessionState: body.sessionState,
    });
    if (!snapshot) throw new ApiError(400, "Malformed thread snapshot");

    await storage.writeFile(projectId, threadPath(userId, body.threadId), JSON.stringify(snapshot));
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { projectId, userId } = await requireProjectAndUser(searchParams.get("projectId"));
    const threadId = requireThreadId(searchParams);
    await storage.delete(projectId, threadPath(userId, threadId));
    return Response.json({ success: true });
  } catch (error) {
    return apiError(error);
  }
}
