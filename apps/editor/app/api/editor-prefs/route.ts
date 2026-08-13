import { NextRequest } from "next/server";
import { requireProjectAndUser, apiError } from "@/lib/authz";
import {
  readEditorPrefs,
  sanitizeEditorPrefs,
  editorPrefsPath,
} from "@/lib/editor-prefs-storage";
import { storage } from "@/lib/storage";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { projectId, userId } = await requireProjectAndUser(searchParams.get("projectId"));
    return Response.json({ prefs: await readEditorPrefs(userId, projectId) });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Merge-on-write, not whole-blob overwrite: the settings toggles and the
 * last-open-file pointer are updated from two independent places in the UI
 * (the settings panel vs. every file selection), neither of which knows the
 * other's current value. Reading the existing blob first means each caller
 * can send just what it changed without clobbering the other field.
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, userId } = await requireProjectAndUser(body.projectId);

    const existing = await readEditorPrefs(userId, projectId);
    const merged = sanitizeEditorPrefs({ ...existing, ...body.prefs });
    await storage.writeFile(projectId, editorPrefsPath(userId), JSON.stringify(merged));
    return Response.json({ success: true, prefs: merged });
  } catch (error) {
    return apiError(error);
  }
}
