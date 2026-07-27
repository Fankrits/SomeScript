# Direct ZIP Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable direct drag-and-drop of `.zip` files anywhere on the workspace dashboard to automatically create LaTeX projects named after the zip archive basenames.

**Architecture:** Create a client component `DashboardDropzone` (`apps/web/components/dashboard-dropzone.tsx`) that wraps the dashboard main area in `apps/web/app/dashboard/page.tsx`. It tracks viewport drag events with HTML5 event counter handling, renders a glassmorphic overlay, validates `.zip` extensions, extracts clean project names, and calls the server action `importProject` for batch imports with Sonner toast feedback.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Lucide React icons, Tailwind CSS, Sonner toasts.

## Global Constraints

- Scope bounded strictly to `apps/web/` (`apps/web/components/dashboard-dropzone.tsx` and `apps/web/app/dashboard/page.tsx`).
- Must use existing `importProject` server action from `@/app/dashboard/actions`.
- Must handle multiple `.zip` files in batch without breaking or crashing.
- Must display Sonner toast notifications for progress and errors.

---

### Task 1: Create `DashboardDropzone` Component

**Files:**
- Create: `apps/web/components/dashboard-dropzone.tsx`

**Interfaces:**
- Consumes: `importProject` from `@/app/dashboard/actions` (`formData: FormData => Promise<{ error: string } | void>`)
- Produces: `DashboardDropzone` component (`({ children }: { children: React.ReactNode }) => JSX.Element`)

- [ ] **Step 1: Write `DashboardDropzone` component**

Create `apps/web/components/dashboard-dropzone.tsx`:

```tsx
"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileArchive, Loader2 } from "lucide-react";
import { importProject } from "@/app/dashboard/actions";
import { toast } from "sonner";

interface DashboardDropzoneProps {
  children: React.ReactNode;
}

export function DashboardDropzone({ children }: DashboardDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dragCounter = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes("Files")) {
      dragCounter.current += 1;
      if (dragCounter.current === 1) {
        setIsDragging(true);
      }
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (!files || files.length === 0) return;

    const zipFiles = files.filter(
      (file) => file.name.endsWith(".zip") || file.type === "application/zip" || file.type === "application/x-zip-compressed"
    );

    if (zipFiles.length === 0) {
      toast.error("Only .zip files can be imported as LaTeX projects");
      return;
    }

    setIsUploading(true);

    for (const file of zipFiles) {
      const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim() || "Imported Project";
      const toastId = toast.loading(`Importing "${baseName}"...`);

      try {
        const formData = new FormData();
        formData.append("name", baseName);
        formData.append("file", file);

        const result = await importProject(formData);
        if (result?.error) {
          toast.error(`Failed to import "${baseName}": ${result.error}`, { id: toastId });
        } else {
          toast.success(`Successfully imported "${baseName}"!`, { id: toastId });
        }
      } catch (err: any) {
        toast.error(`Error importing "${baseName}": ${err.message || "Failed to process"}`, { id: toastId });
      }
    }

    setIsUploading(false);
  }, []);

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className="relative flex-1 flex flex-col min-h-screen"
    >
      {children}

      {/* Drag & Drop Visual Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-md border-4 border-dashed border-primary transition-all animate-in fade-in duration-150 pointer-events-none">
          <div className="flex flex-col items-center p-8 rounded-2xl bg-card/95 border border-border shadow-2xl max-w-md text-center scale-105 transition-transform">
            <div className="h-16 w-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-4 animate-bounce">
              <Upload className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Drop your LaTeX project (.zip) here
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5 font-light">
              Release the file to automatically import and create your project workspace.
            </p>
            <div className="flex items-center gap-2 mt-4 px-3 py-1.5 rounded-full bg-secondary/80 text-xs font-medium text-secondary-foreground border border-border">
              <FileArchive className="h-3.5 w-3.5 text-primary" />
              <span>Supports batch .zip uploads</span>
            </div>
          </div>
        </div>
      )}

      {/* Uploading Overlay Indicator */}
      {isUploading && !isDragging && (
        <div className="fixed bottom-6 right-6 z-40 flex items-center gap-3 bg-card border border-border px-4 py-3 rounded-xl shadow-lg animate-in slide-in-from-bottom-5">
          <Loader2 className="h-4 w-4 text-primary animate-spin" />
          <span className="text-sm font-medium text-foreground">Processing ZIP import...</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify component TypeScript build**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit Task 1**

```bash
git add apps/web/components/dashboard-dropzone.tsx
git commit -m "feat(web): add DashboardDropzone component for direct ZIP upload"
```

---

### Task 2: Wrap Dashboard Page with `DashboardDropzone`

**Files:**
- Modify: `apps/web/app/dashboard/page.tsx`

**Interfaces:**
- Consumes: `DashboardDropzone` from `@/components/dashboard-dropzone`

- [ ] **Step 1: Update `apps/web/app/dashboard/page.tsx`**

Modify `apps/web/app/dashboard/page.tsx` to wrap the `main` content with `DashboardDropzone`:

```tsx
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { projects } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { redirect } from "next/navigation";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { ImportProjectDialog } from "@/components/import-project-dialog";
import { FileText } from "lucide-react";
import ProjectsTable from "@/components/tables-01";
import { DashboardDropzone } from "@/components/dashboard-dropzone";

export default async function DashboardPage() {
  const { userId, orgId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const workspaceId = orgId || userId;

  const workspaceProjects = await db.query.projects.findMany({
    where: eq(projects.workspaceId, workspaceId),
    orderBy: [desc(projects.updatedAt)],
    limit: 200,
  });

  return (
    <DashboardDropzone>
      <main className="flex-1 flex flex-col overflow-hidden bg-background relative min-h-screen">
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
                Create a new LaTeX project or drag and drop a .zip file anywhere to generate, edit, and compile scientific documents in real-time with AI.
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
```

- [ ] **Step 2: Typecheck and build verification**

Run: `cd apps/web && bun x tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Commit Task 2**

```bash
git add apps/web/app/dashboard/page.tsx
git commit -m "feat(web): wrap dashboard page with DashboardDropzone for direct ZIP upload"
```
