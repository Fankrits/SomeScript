import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { templates, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { TemplateDetailsView } from "@/components/template-details-view";

export default async function TemplateDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await auth();
  if (!userId) {
    redirect("/");
  }

  const { id } = await params;
  const user = await currentUser();
  const currentUsername = user?.username || user?.firstName || user?.emailAddresses[0]?.emailAddress?.split("@")[0];

  const [row] = await db
    .select({
      id: templates.id,
      name: templates.name,
      description: templates.description,
      category: templates.category,
      authorId: templates.authorId,
      authorName: templates.authorName,
      authorAvatarUrl: templates.authorAvatarUrl,
      usageCount: templates.usageCount,
      createdAt: templates.createdAt,
      userAuthorName: users.name,
      userAvatarUrl: users.imageUrl,
    })
    .from(templates)
    .leftJoin(users, eq(templates.authorId, users.id))
    .where(eq(templates.id, id));

  if (!row) {
    notFound();
  }

  let resolvedAuthorName = row.userAuthorName || row.authorName;
  if (row.authorId === userId && currentUsername) {
    resolvedAuthorName = currentUsername;
  } else if (!resolvedAuthorName || resolvedAuthorName === "User") {
    resolvedAuthorName = row.userAuthorName && row.userAuthorName !== "User" ? row.userAuthorName : "Community Member";
  }

  const template = {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    authorId: row.authorId,
    authorName: resolvedAuthorName,
    authorAvatarUrl: (row.authorId === userId && user?.imageUrl) || row.userAvatarUrl || row.authorAvatarUrl,
    usageCount: row.usageCount,
    createdAt: row.createdAt,
  };

  return <TemplateDetailsView template={template} currentUserId={userId} />;
}
