import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { templates, users, templateBookmarks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { TemplateGrid } from "@/components/template-grid";

export default async function TemplatesPage() {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const user = await currentUser();
  const currentUsername = user?.username || user?.firstName || user?.emailAddresses[0]?.emailAddress?.split("@")[0];

  // Fetch user's saved template bookmarks from Postgres DB
  const userBookmarks = await db.query.templateBookmarks.findMany({
    where: eq(templateBookmarks.userId, userId),
  });
  const initialBookmarkedIds = userBookmarks.map((b) => b.templateId);

  // Fetch public templates joined with users table to get live Clerk username
  const rawTemplates = await db
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
    .where(eq(templates.isPublic, true))
    .orderBy(desc(templates.usageCount), desc(templates.createdAt))
    .limit(200);

  const publicTemplates = rawTemplates.map((t) => {
    let resolvedAuthorName = t.userAuthorName || t.authorName;

    if (t.authorId === userId && currentUsername) {
      resolvedAuthorName = currentUsername;
    } else if (!resolvedAuthorName || resolvedAuthorName === "User") {
      resolvedAuthorName = t.userAuthorName && t.userAuthorName !== "User" ? t.userAuthorName : "Community";
    }

    return {
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      authorId: t.authorId,
      authorName: resolvedAuthorName,
      authorAvatarUrl: (t.authorId === userId && user?.imageUrl) || t.userAvatarUrl || t.authorAvatarUrl,
      usageCount: t.usageCount,
      createdAt: t.createdAt,
    };
  });

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background relative min-h-screen">
      {/* Background Gradients */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.03),transparent_40%)] pointer-events-none" />

      {/* Top Header */}
      <header className="border-b border-border py-4 sm:py-6 px-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">LaTeX Templates</h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-light mt-0.5">
            Explore, create, and publish LaTeX templates to kickstart your documents.
          </p>
        </div>
        <div className="w-full sm:w-auto">
          <Button asChild className="gap-2 shadow-xs">
            <Link href="/dashboard/templates/new">
              <Plus className="h-4 w-4" />
              Publish Template
            </Link>
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 z-10">
        <TemplateGrid
          templates={publicTemplates}
          currentUserId={userId}
          initialBookmarkedIds={initialBookmarkedIds}
        />
      </div>
    </main>
  );
}
