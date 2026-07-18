import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ImportProjectDialog } from "@/components/import-project-dialog";
import { FileText, Folder, Calendar, ArrowUpRight, Search, Settings } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import ProjectsTable from "@/components/tables-01";
import { Skeleton } from "@/components/ui/skeleton";

export default async function DashboardPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/");
  }

  // Active workspace is orgId, fallback to userId
  const workspaceId = orgId || userId;

  // Fetch projects belonging to this workspace
  const workspaceProjects = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    orderBy: [desc(projects.updatedAt)],
    limit: 200,
  });

  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* 1. Sidebar (Left Panel) */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col justify-between p-6">
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex items-center gap-1.5">
            <Image src="/logo.svg" alt="SomeScript Logo" width={32} height={32} className="h-8 w-8 -mr-1" />
            <span className="font-semibold text-base tracking-tight text-foreground">
              SomeScript
            </span>
          </div>

          {/* Workspace Select Dropdown */}
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider px-1">
              Active Workspace
            </span>
            <div className="rounded-lg border border-sidebar-border bg-card p-1 flex items-center justify-between shadow-sm">
              <OrganizationSwitcher
                fallback={
                  <div className="flex items-center gap-2 px-2 py-1.5 w-full">
                    <Skeleton className="h-6 w-6 rounded-md" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                }
                hidePersonal={false}
                afterCreateOrganizationUrl="/dashboard"
                afterLeaveOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                afterSelectPersonalUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger: "w-full flex items-center justify-between text-foreground hover:bg-secondary/40 px-2 py-1.5 rounded-lg text-sm transition-all border-none bg-transparent font-medium",
                    organizationPreview: "w-full",
                  },
                }}
              />
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex flex-col gap-1.5 mt-2">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider px-1 mb-1">
              Navigation
            </span>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all bg-primary/10 text-primary border border-primary/10"
            >
              <Folder className="h-4 w-4" />
              Projects
            </Link>
          </nav>
        </div>

        {/* User Info / Profile Avatar */}
        <div className="border-t border-sidebar-border pt-6 flex items-center gap-3">
          <UserButton
            fallback={
              <div className="flex items-center gap-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-full" />
              </div>
            }
            appearance={{
              elements: {
                userButtonBox: "flex flex-row-reverse gap-3 items-center w-full",
                userButtonOuterIdentifier: "text-muted-foreground font-medium text-sm text-left truncate max-w-[120px] hover:text-primary transition-colors",
              },
            }}
            showName
          />
        </div>
      </aside>

      {/* 2. Main Content Panel */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.03),transparent_40%)] pointer-events-none" />

        {/* Top Header */}
        <header className="border-b border-border py-6 px-8 flex items-center justify-between z-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground font-light mt-0.5">Manage and compile your LaTeX documents.</p>
          </div>
          <div className="flex items-center gap-3">
            <ImportProjectDialog />
            <NewProjectDialog />
          </div>
        </header>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-8 z-10">
          {workspaceProjects.length === 0 ? (
            /* Empty State */
            <div className="h-[400px] rounded-xl border border-dashed border-border bg-card/40 flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto mt-12 shadow-sm">
              <div className="h-12 w-12 rounded-lg bg-secondary/60 border border-border flex items-center justify-center text-primary mb-4">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">No projects yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm font-light mt-2 mb-6">
                Create a new LaTeX project to generate, edit, and compile scientific documents in real-time with AI.
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
    </div>
  );
}
