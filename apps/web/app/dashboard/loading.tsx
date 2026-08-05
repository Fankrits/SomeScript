import { Skeleton } from "@/components/ui/skeleton";

// Shown via Suspense while the dashboard page awaits auth() + the projects query.
// Mirrors the main content layout so there is no layout shift or duplicate sidebar when loading.
export default function DashboardLoading() {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-background relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,76,92,0.03),transparent_40%)] pointer-events-none" />

      <header className="border-b border-border py-4 sm:py-6 px-4 sm:px-8 flex items-center justify-between z-10">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">Projects</h1>
          <p className="text-xs sm:text-sm text-muted-foreground font-light mt-0.5">
            Manage and compile your LaTeX documents.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-32 rounded-lg" />
          <Skeleton className="h-10 w-36 rounded-lg" />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-8 z-10">
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
  );
}
