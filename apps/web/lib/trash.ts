import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { editorFetch } from "@/lib/editor-api";

export const TRASH_RETENTION_DAYS = 7;

/** Deletes the files then the row. Shared by manual purge and the retention sweep. */
export async function hardDeleteProject(projectId: string): Promise<void> {
  // Delete files first: the editor's ownership check needs the DB row to still exist.
  // If the editor is unreachable we still remove the row; orphaned storage is
  // reclaimed manually (see docs/ops-checklist.md).
  try {
    const res = await editorFetch("/api/project/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      console.error("Editor file deletion failed:", await res.text());
    }
  } catch (error) {
    console.error("Error calling editor service to delete project files:", error);
  }

  await db.delete(projects).where(eq(projects.id, projectId));
}

// ponytail: the retention sweep runs when the Trash page is loaded, not on a
// schedule — a workspace nobody opens keeps its expired files until someone
// looks. Move to a cron (Vercel cron hitting a route) if storage cost or a hard
// deletion deadline starts to matter. Not a server action on purpose: it takes a
// workspaceId and does no auth of its own.
export async function purgeExpiredProjects(workspaceId: string): Promise<void> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);
  const expired = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.workspaceId, workspaceId), lt(projects.deletedAt, cutoff)));

  for (const { id } of expired) await hardDeleteProject(id);
}
