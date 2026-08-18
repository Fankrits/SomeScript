import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { and, eq, desc, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ImportProjectDialog } from "@/components/import-project-dialog";
import { DashboardDropzone } from "@/components/dashboard-dropzone";
import { FileText } from "lucide-react";
import ProjectsTable from "@/components/tables-01";

export default async function DashboardPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/");
  }

  // Active workspace is orgId, fallback to userId
  const workspaceId = orgId || userId;

  // Fetch projects belonging to this workspace
  const workspaceProjects = await db.query.projects.findMany({
    where: and(eq(projects.workspaceId, workspaceId), isNull(projects.deletedAt)),
    orderBy: [desc(projects.updatedAt)],
    limit: 200,
  });

  return (
    <DashboardDropzone>
      <main className="flex-1 flex flex-col overflow-hidden bg-background relative min-h-screen">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.03),transparent_40%)] pointer-events-none" />

        {/* Top Header */}
        <header className="border-b border-border py-4 sm:py-6 px-4 sm:px-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 z-10">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              Projects
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground font-light mt-0.5">
              Manage and compile your LaTeX documents.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 w-full sm:flex sm:w-auto sm:items-center">
            <ImportProjectDialog />
            <NewProjectDialog />
          </div>
        </header>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 z-10">
          {workspaceProjects.length === 0 ? (
            /* Empty State */
            <div className="h-[400px] rounded-xl border border-dashed border-border bg-card/40 flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto mt-12 shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-secondary/60 border border-border flex items-center justify-center text-primary mb-4">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No projects yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm font-light mt-2 mb-6">
                Create a new LaTeX project or drag and drop a .zip file anywhere to generate, edit,
                and compile scientific documents in real-time with AI.
              </p>
              <div className="flex items-center gap-3">
                <ImportProjectDialog />
                <NewProjectDialog />
              </div>
            </div>
          ) : (
            /* Projects Table */
            <ProjectsTable
              projects={workspaceProjects}
              editorUrl={process.env.NEXT_PUBLIC_EDITOR_URL || "http://localhost:3002"}
            />
          )}
        </div>
      </main>
    </DashboardDropzone>
  );
}
