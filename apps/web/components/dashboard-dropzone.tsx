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
      (file) =>
        file.name.endsWith(".zip") ||
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed"
    );

    if (zipFiles.length === 0) {
      toast.error("Only .zip files can be imported as LaTeX projects");
      return;
    }

    setIsUploading(true);

    for (const file of zipFiles) {
      const baseName =
        file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ").trim() || "Imported Project";
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
        toast.error(`Failed to import "${baseName}": ${err.message || "Failed to process"}`, { id: toastId });
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
