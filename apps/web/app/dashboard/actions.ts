"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, workspaces, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { assertProjectLimit, assertWorkspaceActive, seedWorkspaceDefaults } from "@/lib/limits";
import { formString, formFile } from "@/lib/utils";

// Helper to ensure the active workspace exists in our database
export async function ensureWorkspaceExists(orgId: string | null, userId: string) {
  const targetId = orgId || userId;

  // 1. Always ensure the user row exists in the database first (essential for local dev webhooks bypass)
  const user = await currentUser();
  if (user) {
    await db
      .insert(users)
      .values({
        id: userId,
        email: user.emailAddresses[0]?.emailAddress || "",
        name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
        imageUrl: user.imageUrl,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: user.emailAddresses[0]?.emailAddress || "",
          name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
          imageUrl: user.imageUrl,
          updatedAt: new Date(),
        },
      });
  }

  // 2. Check if workspace exists
  const existing = await db.query.workspaces.findFirst({
    // oxlint-disable-next-line no-shadow -- Drizzle's relational-query callback API: this `eq` is the query builder's own helper, not the top-level import.
    where: (w, { eq }) => eq(w.id, targetId),
  });

  if (!existing) {
    let name = orgId ? `Workspace ${orgId.substring(0, 8)}` : "Personal Workspace";
    let slug = orgId ? `org-${orgId.substring(0, 8)}` : "personal";

    if (!orgId && user) {
      name = `${user.firstName || "User"}'s Workspace`;
      slug = `${user.firstName?.toLowerCase() || "user"}-personal`;
    }

    await db.insert(workspaces).values({
      id: targetId,
      name,
      slug,
      ownerId: userId,
    });

    // Same free/locked decision the Clerk `organization.created` webhook makes for
    // org-backed workspaces (see seedWorkspaceDefaults) — personal workspaces have
    // no such webhook event, and in local dev the webhook may not be reachable at
    // all, so this is the only place those rows are guaranteed to get created.
    // onConflictDoNothing makes it a safe no-op on the (usual) org path where the
    // webhook got there first.
    await seedWorkspaceDefaults(targetId, userId);
  }

  return targetId;
}

import { editorFetch } from "@/lib/editor-api";

// Next.js redacts thrown Error messages from Server Functions in production
// builds (see node_modules/next/dist/docs/01-app/01-getting-started/10-error-handling.md
// "Handling expected errors" — model expected errors as return values, not throws).
// So every expected failure below is returned as { error } instead of thrown.
export async function createProject(formData: FormData): Promise<{ error: string } | void> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  const name = formString(formData, "name");
  if (!name || name.trim() === "") {
    return { error: "Project name is required" };
  }

  // Ensure active workspace exists
  const workspaceId = await ensureWorkspaceExists(orgId || null, userId);
  try {
    await assertWorkspaceActive(workspaceId);
    await assertProjectLimit(workspaceId);
  } catch (error: any) {
    return { error: error.message || "Failed to create project" };
  }

  const [project] = await db
    .insert(projects)
    .values({ name: name.trim(), workspaceId })
    .returning();

  if (!project) return { error: "Failed to create project" };

  const res = await editorFetch("/api/project/seed", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: project.id }),
  });

  if (!res.ok) {
    await db.delete(projects).where(eq(projects.id, project.id));
    return { error: "Failed to initialize project files" };
  }

  revalidatePath("/dashboard");
}

export async function importProject(formData: FormData): Promise<{ error: string } | void> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  const name = formString(formData, "name");
  const file = formFile(formData, "file");

  if (!name || name.trim() === "") {
    return { error: "Project name is required" };
  }

  if (!file || file.size === 0) {
    return { error: "ZIP file is required" };
  }

  // Ensure active workspace exists
  const workspaceId = await ensureWorkspaceExists(orgId || null, userId);
  try {
    await assertWorkspaceActive(workspaceId);
    await assertProjectLimit(workspaceId);
  } catch (error: any) {
    return { error: error.message || "Failed to create project" };
  }

  // 1. Insert into database
  const [project] = await db
    .insert(projects)
    .values({
      name: name.trim(),
      workspaceId,
    })
    .returning();

  if (!project) {
    return { error: "Failed to create project record" };
  }

  // 2. Call the editor's import API
  try {
    const editorFormData = new FormData();
    editorFormData.append("projectId", project.id);
    editorFormData.append("file", file);

    const res = await editorFetch("/api/project/import", {
      method: "POST",
      body: editorFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Failed to import files to editor service:", errorText);
      // Clean up the project if file import failed
      await db.delete(projects).where(eq(projects.id, project.id));
      return { error: `Failed to import files: ${errorText}` };
    }
  } catch (error: any) {
    console.error("Error calling editor service to import files:", error);
    // Clean up the project if file import failed
    await db.delete(projects).where(eq(projects.id, project.id));
    return { error: error.message || "Failed to call editor service for import" };
  }

  revalidatePath("/dashboard");
}

export async function renameProject(
  projectId: string,
  newName: string,
): Promise<{ error: string } | void> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  if (!newName || newName.trim() === "") {
    return { error: "Project name is required" };
  }

  const workspaceId = orgId || userId;

  const updated = await db
    .update(projects)
    .set({ name: newName.trim(), updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .returning({ id: projects.id });

  if (updated.length === 0) {
    return { error: "Project not found" };
  }

  revalidatePath("/dashboard");
}

export async function deleteProject(projectId: string): Promise<{ error: string } | void> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return { error: "Unauthorized" };
  }

  const workspaceId = orgId || userId;

  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)),
  });
  if (!project) return { error: "Project not found" };

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

  await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)));

  revalidatePath("/dashboard");
}
