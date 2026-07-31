"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { templates, projects } from "@/db/schema";
import { revalidatePath } from "next/cache";
import { eq, and, sql } from "drizzle-orm";
import { assertProjectLimit, assertWorkspaceActive } from "@/lib/limits";
import { editorFetch } from "@/lib/editor-api";
import { ensureWorkspaceExists } from "@/app/dashboard/actions";


export async function publishTemplate(formData: FormData): Promise<{ error?: string; success?: boolean; templateId?: string }> {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || "";
  const category = (formData.get("category") as string) || "General";
  const file = formData.get("file") as File | null;

  if (!name || name.trim() === "") {
    return { error: "Template name is required" };
  }

  if (!file || file.size === 0) {
    return { error: "ZIP file is required" };
  }

  const user = await currentUser();
  const authorName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.emailAddresses[0]?.emailAddress || "Anonymous" : "Anonymous";
  const authorAvatarUrl = user?.imageUrl || null;

  // 1. Insert DB record
  const [template] = await db
    .insert(templates)
    .values({
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      authorId: userId,
      authorName,
      authorAvatarUrl,
      usageCount: 0,
      isPublic: true,
    })
    .returning();

  if (!template) {
    return { error: "Failed to create template record" };
  }

  // 2. Upload template ZIP to editor storage
  try {
    const editorFormData = new FormData();
    editorFormData.append("templateId", template.id);
    editorFormData.append("file", file);

    const res = await editorFetch("/api/template/upload", {
      method: "POST",
      body: editorFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      await db.delete(templates).where(eq(templates.id, template.id));
      return { error: `Failed to store template files: ${errorText}` };
    }
  } catch (error: any) {
    await db.delete(templates).where(eq(templates.id, template.id));
    return { error: error.message || "Failed to upload template" };
  }

  revalidatePath("/dashboard/templates");
  return { success: true, templateId: template.id };
}

export async function updateTemplate(formData: FormData): Promise<{ error?: string; success?: boolean }> {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const templateId = formData.get("templateId") as string;
  const name = formData.get("name") as string;
  const description = (formData.get("description") as string) || "";
  const category = (formData.get("category") as string) || "General";
  const file = formData.get("file") as File | null;

  if (!templateId) return { error: "Template ID is required" };
  if (!name || name.trim() === "") return { error: "Template name is required" };

  const template = await db.query.templates.findFirst({
    where: and(eq(templates.id, templateId), eq(templates.authorId, userId)),
  });

  if (!template) return { error: "Template not found or unauthorized" };

  const user = await currentUser();
  const authorAvatarUrl = user?.imageUrl || template.authorAvatarUrl;

  await db
    .update(templates)
    .set({
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      authorAvatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(templates.id, templateId));

  if (file && file.size > 0) {
    try {
      const editorFormData = new FormData();
      editorFormData.append("templateId", templateId);
      editorFormData.append("file", file);

      const res = await editorFetch("/api/template/upload", {
        method: "POST",
        body: editorFormData,
      });

      if (!res.ok) {
        const errorText = await res.text();
        return { error: `Failed to update template files: ${errorText}` };
      }
    } catch (error: any) {
      return { error: error.message || "Failed to upload updated template" };
    }
  }

  revalidatePath("/dashboard/templates");
  revalidatePath(`/dashboard/templates/${templateId}`);
  return { success: true };
}

export async function useTemplate(templateId: string, customProjectName?: string): Promise<{ error?: string; redirectUrl?: string }> {
  const { userId, orgId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const template = await db.query.templates.findFirst({
    where: eq(templates.id, templateId),
  });

  if (!template) return { error: "Template not found" };

  const workspaceId = await ensureWorkspaceExists(orgId || null, userId);
  try {
    await assertWorkspaceActive(workspaceId);
    await assertProjectLimit(workspaceId);
  } catch (error: any) {
    return { error: error.message || "Failed to create project from template" };
  }

  const projectName = (customProjectName && customProjectName.trim()) || template.name;

  // 1. Create Project DB Record
  const [project] = await db
    .insert(projects)
    .values({
      name: projectName,
      workspaceId,
    })
    .returning();

  if (!project) return { error: "Failed to create project" };

  // 2. Call Editor API to copy template files to new project
  try {
    const res = await editorFetch("/api/template/use", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templateId: template.id,
        projectId: project.id,
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      await db.delete(projects).where(eq(projects.id, project.id));
      return { error: `Failed to initialize template files: ${errorText}` };
    }
  } catch (error: any) {
    await db.delete(projects).where(eq(projects.id, project.id));
    return { error: error.message || "Failed to copy template files" };
  }

  // 3. Track usage count
  await db
    .update(templates)
    .set({
      usageCount: sql`${templates.usageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(templates.id, template.id));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/templates");

  const editorBaseUrl = process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002";
  return { redirectUrl: `${editorBaseUrl}/?project=${project.id}` };
}

export async function deleteTemplate(templateId: string): Promise<{ error?: string; success?: boolean }> {
  const { userId } = await auth();
  if (!userId) return { error: "Unauthorized" };

  const template = await db.query.templates.findFirst({
    where: and(eq(templates.id, templateId), eq(templates.authorId, userId)),
  });

  if (!template) return { error: "Template not found or unauthorized" };

  await db.delete(templates).where(eq(templates.id, templateId));
  revalidatePath("/dashboard/templates");
  return { success: true };
}
