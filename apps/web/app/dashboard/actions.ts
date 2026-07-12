"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, workspaces, users } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";

// Helper to ensure the active workspace exists in our database
async function ensureWorkspaceExists(orgId: string | null, userId: string) {
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
  }

  return targetId;
}

export async function createProject(formData: FormData) {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const name = formData.get("name") as string;
  if (!name || name.trim() === "") {
    throw new Error("Project name is required");
  }

  // Ensure active workspace exists
  const workspaceId = await ensureWorkspaceExists(orgId || null, userId);

  await db.insert(projects).values({
    name: name.trim(),
    workspaceId,
  });

  revalidatePath("/dashboard");
}

export async function importProject(formData: FormData) {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const name = formData.get("name") as string;
  const file = formData.get("file") as File | null;

  if (!name || name.trim() === "") {
    throw new Error("Project name is required");
  }

  if (!file || file.size === 0) {
    throw new Error("ZIP file is required");
  }

  // Ensure active workspace exists
  const workspaceId = await ensureWorkspaceExists(orgId || null, userId);

  // 1. Insert into database
  const [project] = await db
    .insert(projects)
    .values({
      name: name.trim(),
      workspaceId,
    })
    .returning();

  if (!project) {
    throw new Error("Failed to create project record");
  }

  // 2. Call the editor's import API
  try {
    const editorUrl = process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002";
    
    const editorFormData = new FormData();
    editorFormData.append("projectId", project.id);
    editorFormData.append("file", file);

    const res = await fetch(`${editorUrl}/api/project/import`, {
      method: "POST",
      body: editorFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Failed to import files to editor service:", errorText);
      // Clean up the project if file import failed
      await db.delete(projects).where(eq(projects.id, project.id));
      throw new Error(`Failed to import files: ${errorText}`);
    }
  } catch (error: any) {
    console.error("Error calling editor service to import files:", error);
    // Clean up the project if file import failed
    await db.delete(projects).where(eq(projects.id, project.id));
    throw new Error(error.message || "Failed to call editor service for import");
  }

  revalidatePath("/dashboard");
}


export async function renameProject(projectId: string, newName: string) {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  if (!newName || newName.trim() === "") {
    throw new Error("Project name is required");
  }

  const workspaceId = orgId || userId;

  const updated = await db
    .update(projects)
    .set({ name: newName.trim(), updatedAt: new Date() })
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .returning({ id: projects.id });

  if (updated.length === 0) {
    throw new Error("Project not found");
  }

  revalidatePath("/dashboard");
}

export async function deleteProject(projectId: string) {
  const { userId, orgId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const workspaceId = orgId || userId;

  // 1. Delete from database
  const deleted = await db
    .delete(projects)
    .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
    .returning({ id: projects.id });

  if (deleted.length === 0) {
    throw new Error("Project not found");
  }

  // 2. Delete files from storage by invoking the editor's delete API
  try {
    const editorUrl = process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002";
    const res = await fetch(`${editorUrl}/api/project/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) {
      console.error("Failed to delete project files from editor service:", await res.text());
    }
  } catch (error) {
    console.error("Error calling editor service to delete project files:", error);
  }

  revalidatePath("/dashboard");
}

