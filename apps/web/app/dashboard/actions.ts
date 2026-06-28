"use server";

import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects, workspaces, users } from "@/db/schema";
import { revalidatePath } from "next/cache";

// Helper to ensure the active workspace exists in our database
async function ensureWorkspaceExists(orgId: string | null, userId: string) {
  const targetId = orgId || userId;

  // Check if workspace exists
  const existing = await db.query.workspaces.findFirst({
    where: (w, { eq }) => eq(w.id, targetId),
  });

  if (!existing) {
    // If it's a personal workspace, get user details to name it
    let name = "Personal Workspace";
    let slug = "personal";

    if (orgId) {
      // The webhook should have created it, but as a fallback/safety:
      name = `Workspace ${orgId.substring(0, 8)}`;
      slug = `org-${orgId.substring(0, 8)}`;
    } else {
      const user = await currentUser();
      if (user) {
        name = `${user.firstName || "User"}'s Workspace`;
        slug = `${user.firstName?.toLowerCase() || "user"}-personal`;

        // Also ensure user row exists
        await db
          .insert(users)
          .values({
            id: userId,
            email: user.emailAddresses[0]?.emailAddress || "",
            name: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "User",
            imageUrl: user.imageUrl,
            updatedAt: new Date(),
          })
          .onConflictDoNothing();
      }
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
