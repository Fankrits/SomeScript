import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { requireProject, apiError, ApiError } from "@/lib/authz";
import {
  sanitizeIndex,
  sanitizeThreadSnapshot,
  indexPath,
  threadPath,
} from "@/lib/eve-threads-storage";
import { storage } from "@/lib/storage";
import { checkRate } from "@/lib/rate-limit";

const MAX_MIGRATED_THREADS = 200;

/**
 * One-time bulk import of a browser's localStorage thread history into cloud
 * storage, run once per browser on first load after this feature shipped.
 * Best-effort: a malformed individual thread is skipped rather than failing
 * the whole batch, so one corrupt blob doesn't strand the rest.
 */
export async function POST(req: NextRequest) {
  try {
    await checkRate("eve-threads-migrate", 5, 60_000);
    const { userId } = await auth();
    if (!userId) throw new ApiError(401, "Unauthorized");
    const body = await req.json();
    const projectId = await requireProject(body.projectId);
    if (!Array.isArray(body.threads)) throw new ApiError(400, "Missing threads");

    let migrated = 0;
    for (const entry of body.threads.slice(0, MAX_MIGRATED_THREADS)) {
      if (typeof entry !== "object" || entry === null) continue;
      const { id, snapshot } = entry as Record<string, unknown>;
      if (typeof id !== "string") continue;
      // Version-gated same as a normal save — a blob from an older eve client
      // is skipped, not force-upgraded, since its shape may not replay cleanly.
      const sanitized = sanitizeThreadSnapshot(snapshot);
      if (!sanitized) continue;
      await storage.writeFile(projectId, threadPath(userId, id), JSON.stringify(sanitized));
      migrated++;
    }

    const index = sanitizeIndex(body.index);
    await storage.writeFile(projectId, indexPath(userId), JSON.stringify(index));

    return Response.json({ success: true, migrated });
  } catch (error) {
    return apiError(error);
  }
}
