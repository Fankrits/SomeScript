import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { and, eq, desc, isNotNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { TRASH_RETENTION_DAYS, purgeExpiredProjects } from "@/lib/trash";
import TrashTable from "@/components/trash-table";

export default async function TrashPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const workspaceId = orgId || userId;

  // Sweep first, so the list never shows something already past its window.
  await purgeExpiredProjects(workspaceId);

  const trashedProjects = await db.query.projects.findMany({
    where: and(eq(projects.workspaceId, workspaceId), isNotNull(projects.deletedAt)),
    orderBy: [desc(projects.deletedAt)],
    limit: 200,
  });

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background relative min-h-screen">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.03),transparent_40%)] pointer-events-none" />

      <header className="border-b border-border py-4 sm:py-6 px-4 sm:px-8 z-10">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Trash</h1>
        <p className="text-xs sm:text-sm text-muted-foreground font-light mt-0.5">
          Deleted projects are kept for {TRASH_RETENTION_DAYS} days, then removed permanently.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 z-10">
        {trashedProjects.length === 0 ? (
          <div className="h-[400px] rounded-xl border border-dashed border-border bg-card/40 flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto mt-12 shadow-sm">
            <div className="h-12 w-12 rounded-lg bg-secondary/60 border border-border flex items-center justify-center text-primary mb-4">
              <Trash2 className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">Trash is empty</h3>
            <p className="text-sm text-muted-foreground max-w-sm font-light mt-2">
              Projects you delete land here for {TRASH_RETENTION_DAYS} days, so you can restore
              them.
            </p>
          </div>
        ) : (
          <TrashTable
            projects={trashedProjects.map((p) => ({
              id: p.id,
              name: p.name,
              deletedAt: p.deletedAt!,
            }))}
            retentionDays={TRASH_RETENTION_DAYS}
          />
        )}
      </div>
    </main>
  );
}
