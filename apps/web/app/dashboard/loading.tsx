import { Skeleton } from "@/components/ui/skeleton";
import { Folder } from "lucide-react";
import Image from "next/image";

// Shown via Suspense while the dashboard page awaits auth() + the projects query.
// Mirrors the real layout so there is no shift when content streams in.
export default function DashboardLoading() {
  return (
    <div className="flex h-screen bg-background text-foreground font-sans overflow-hidden">
      {/* Sidebar — static chrome is real; only data-dependent widgets are skeletons */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col justify-between p-6">
        <div className="flex flex-col gap-8">
          <div className="flex items-center gap-1.5">
            <Image src="/logo.svg" alt="SomeScript Logo" width={32} height={32} className="h-8 w-8 -mr-1" />
            <span className="font-semibold text-base tracking-tight text-foreground">SomeScript</span>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider px-1">
              Active Workspace
            </span>
            <div className="rounded-lg border border-sidebar-border bg-card p-1 shadow-sm">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Skeleton className="h-6 w-6 rounded-md" />
                <Skeleton className="h-4 w-28" />
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5 mt-2">
            <span className="text-muted-foreground text-[10px] uppercase font-bold tracking-wider px-1 mb-1">
              Navigation
            </span>
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium bg-primary/10 text-primary border border-primary/10">
              <Folder className="h-4 w-4" />
              Projects
            </div>
          </nav>
        </div>

        <div className="border-t border-sidebar-border pt-6 flex items-center gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.03),transparent_40%)] pointer-events-none" />

        <header className="border-b border-border py-6 px-8 flex items-center justify-between z-10">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground font-light mt-0.5">Manage and compile your LaTeX documents.</p>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-32 rounded-lg" />
            <Skeleton className="h-10 w-36 rounded-lg" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 z-10">
          {/* Table skeleton — header labels are static, rows pulse */}
          <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1fr_1fr_1fr_240px] border-b border-border bg-secondary/30 px-6 py-4 text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              <span>Project Name</span>
              <span>Created Date</span>
              <span>Last Modified</span>
              <span className="text-right">Actions</span>
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_1fr_240px] items-center border-b border-border px-6 py-4 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-8 w-8 rounded-lg" />
                  <Skeleton className="h-4" style={{ width: `${45 + ((i * 17) % 40)}%` }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3.5 w-3.5 rounded-sm" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <Skeleton className="h-4 w-20" />
                <div className="flex items-center justify-end gap-1.5">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
