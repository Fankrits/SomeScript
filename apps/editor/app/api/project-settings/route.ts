import { storage } from "@/lib/storage";
import { requireProject, apiError } from "@/lib/authz";
import {
  readProjectSettings,
  sanitizeProjectSettings,
  PROJECT_SETTINGS_PATH,
} from "@/lib/project-settings";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = await requireProject(searchParams.get("projectId"));
    return Response.json({ settings: await readProjectSettings(projectId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const projectId = await requireProject(body.projectId);
    const settings = sanitizeProjectSettings(body.settings);

    await storage.writeFile(projectId, PROJECT_SETTINGS_PATH, JSON.stringify(settings));
    // No CRDT to push into (nothing ever opens this path as a file) — the
    // caller pings collab.notifyProjectSettingsChanged() over its own open
    // WebSocket after this resolves, same as TasksPanel.save() does.
    return Response.json({ success: true, settings });
  } catch (error) {
    return apiError(error);
  }
}
