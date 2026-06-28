import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { FileText, Folder, Calendar, ArrowUpRight, Search, Settings } from "lucide-react";
import Link from "next/link";

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
  });

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-50 font-sans overflow-hidden">
      {/* 1. Sidebar (Left Panel) */}
      <aside className="w-64 border-r border-zinc-900 bg-zinc-950 flex flex-col justify-between p-6">
        <div className="flex flex-col gap-8">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <span className="font-bold text-white text-base">S</span>
            </div>
            <span className="font-semibold text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-zinc-50 to-zinc-400">
              SomeScript
            </span>
          </div>

          {/* Workspace Select Dropdown */}
          <div className="flex flex-col gap-2">
            <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider px-1">
              Active Workspace
            </span>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-1 flex items-center justify-between">
              <OrganizationSwitcher
                hidePersonal={false}
                afterCreateOrganizationUrl="/dashboard"
                afterLeaveOrganizationUrl="/dashboard"
                afterSelectOrganizationUrl="/dashboard"
                afterSelectPersonalUrl="/dashboard"
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    organizationSwitcherTrigger: "w-full flex items-center justify-between text-zinc-300 hover:text-zinc-50 hover:bg-zinc-800/40 px-2 py-1.5 rounded-lg text-sm transition-all border-none bg-transparent font-medium",
                    organizationPreview: "w-full",
                  },
                }}
              />
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex flex-col gap-1.5 mt-2">
            <span className="text-zinc-500 text-[10px] uppercase font-bold tracking-wider px-1 mb-1">
              Navigation
            </span>
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all bg-indigo-600/10 text-indigo-400 border border-indigo-500/10"
            >
              <Folder className="h-4 w-4" />
              Projects
            </Link>
          </nav>
        </div>

        {/* User Info / Profile Avatar */}
        <div className="border-t border-zinc-900 pt-6 flex items-center gap-3">
          <UserButton
            appearance={{
              elements: {
                userButtonBox: "flex flex-row-reverse gap-3 items-center w-full",
                userButtonOuterIdentifier: "text-zinc-400 font-medium text-sm text-left truncate max-w-[120px] order-last hover:text-zinc-200 transition-colors",
              },
            }}
            showName
          />
        </div>
      </aside>

      {/* 2. Main Content Panel */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950/40 relative">
        {/* Background Gradients */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(99,102,241,0.03),transparent_40%)] pointer-events-none" />

        {/* Top Header */}
        <header className="border-b border-zinc-900 py-6 px-8 flex items-center justify-between z-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-50">Projects</h1>
            <p className="text-sm text-zinc-500 font-light mt-0.5">Manage and compile your LaTeX documents.</p>
          </div>
          <NewProjectDialog />
        </header>

        {/* Projects List */}
        <div className="flex-1 overflow-y-auto p-8 z-10">
          {workspaceProjects.length === 0 ? (
            /* Empty State */
            <div className="h-[400px] rounded-2xl border border-dashed border-zinc-900 bg-zinc-900/10 flex flex-col items-center justify-center text-center p-8 max-w-2xl mx-auto mt-12">
              <div className="h-12 w-12 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-center text-zinc-500 mb-4">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-200">No projects yet</h3>
              <p className="text-sm text-zinc-500 max-w-sm font-light mt-2 mb-6">
                Create a new LaTeX project to generate, edit, and compile scientific documents in real-time with AI.
              </p>
              <NewProjectDialog />
            </div>
          ) : (
            /* Projects Table */
            <div className="border border-zinc-900 rounded-2xl bg-zinc-900/10 overflow-hidden backdrop-blur-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-900 bg-zinc-900/20 text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                    <th className="px-6 py-4">Project Name</th>
                    <th className="px-6 py-4">Created Date</th>
                    <th className="px-6 py-4">Last Modified</th>
                    <th className="px-6 py-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-900 text-sm text-zinc-300">
                  {workspaceProjects.map((project) => (
                    <tr key={project.id} className="hover:bg-zinc-900/40 transition-colors group">
                      <td className="px-6 py-4 font-medium text-zinc-100 flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-500 group-hover:text-indigo-400 group-hover:border-indigo-500/20 transition-all">
                          <FileText className="h-4 w-4" />
                        </div>
                        {project.name}
                      </td>
                      <td className="px-6 py-4 text-zinc-500 font-light flex-row items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {new Date(project.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-zinc-500 font-light">
                        {new Date(project.updatedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Link
                          // Open in core editor (app runs on port 3000 usually)
                          href={`http://localhost:3000/?projectId=${project.id}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-500/5 hover:bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/10"
                        >
                          Open Editor <ArrowUpRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
