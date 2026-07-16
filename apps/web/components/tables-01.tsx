"use client";

import { useState } from "react";
import { FileText, Calendar, ArrowUpRight, Download, FileDown, Trash2, Loader2, Pencil, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Link from "next/link";
import { deleteProject, renameProject } from "@/app/dashboard/actions";
import { Editable, EditableArea, EditableInput, EditablePreview } from "@/components/ui/editable";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ProjectsTableProps {
  projects: Project[];
  editorUrl: string;
}

export default function ProjectsTable({ projects, editorUrl }: ProjectsTableProps) {
  const [pendingAction, setPendingAction] = useState<{
    id: string;
    type: "pdf" | "zip" | "delete";
  } | null>(null);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [sortConfig, setSortConfig] = useState<{
    key: "name" | "createdAt" | "updatedAt";
    direction: "asc" | "desc";
  }>({ key: "updatedAt", direction: "desc" });

  const requestSort = (key: "name" | "createdAt" | "updatedAt") => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: "name" | "createdAt" | "updatedAt") => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="ml-1.5 h-3.5 w-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="ml-1.5 h-3.5 w-3.5 text-primary shrink-0" />
    ) : (
      <ArrowDown className="ml-1.5 h-3.5 w-3.5 text-primary shrink-0" />
    );
  };

  const sortedProjects = [...projects].sort((a, b) => {
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];

    if (sortConfig.key === "name") {
      const aStr = (aVal as string).toLowerCase();
      const bStr = (bVal as string).toLowerCase();
      if (aStr < bStr) return sortConfig.direction === "asc" ? -1 : 1;
      if (aStr > bStr) return sortConfig.direction === "asc" ? 1 : -1;
    } else {
      const aTime = new Date(aVal).getTime();
      const bTime = new Date(bVal).getTime();
      if (aTime < bTime) return sortConfig.direction === "asc" ? -1 : 1;
      if (aTime > bTime) return sortConfig.direction === "asc" ? 1 : -1;
    }
    return 0;
  });

  const handleRename = async (projectId: string, newName: string) => {
    if (!newName || newName.trim() === "") return;
    try {
      await renameProject(projectId, newName);
      toast.success("Project renamed successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to rename project");
    }
  };

  const handleDelete = async (projectId: string) => {
    setPendingAction({ id: projectId, type: "delete" });
    try {
      await deleteProject(projectId);
      toast.success("Project deleted successfully");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to delete project");
    } finally {
      setPendingAction(null);
    }
  };

  const handleDownload = async (projectId: string, type: "pdf" | "zip") => {
    setPendingAction({ id: projectId, type });
    try {
      const url = `/api/project/export?projectId=${projectId}&type=${type}`;
      // Trigger browser download by creating an anchor element
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `project-${projectId}.${type}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Started downloading ${type.toUpperCase()}`);
    } catch (error) {
      toast.error(`Failed to download ${type.toUpperCase()}`);
    } finally {
      // Small timeout to make loading indicator visible
      setTimeout(() => {
        setPendingAction(null);
      }, 800);
    }
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
      <TooltipProvider>
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:bg-transparent select-none">
              <TableHead className="px-6 py-4">
                <button
                  onClick={() => requestSort("name")}
                  className="flex items-center hover:text-foreground transition-colors font-semibold text-left text-xs uppercase tracking-wider group"
                >
                  Project Name {getSortIcon("name")}
                </button>
              </TableHead>
              <TableHead className="px-6 py-4">
                <button
                  onClick={() => requestSort("createdAt")}
                  className="flex items-center hover:text-foreground transition-colors font-semibold text-left text-xs uppercase tracking-wider group"
                >
                  Created Date {getSortIcon("createdAt")}
                </button>
              </TableHead>
              <TableHead className="px-6 py-4">
                <button
                  onClick={() => requestSort("updatedAt")}
                  className="flex items-center hover:text-foreground transition-colors font-semibold text-left text-xs uppercase tracking-wider group"
                >
                  Last Modified {getSortIcon("updatedAt")}
                </button>
              </TableHead>
              <TableHead className="px-6 py-4 text-right w-[240px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border text-sm text-foreground">
            {sortedProjects.map((project) => {
              const isDeletePending = pendingAction?.id === project.id && pendingAction.type === "delete";
              const isPdfPending = pendingAction?.id === project.id && pendingAction.type === "pdf";
              const isZipPending = pendingAction?.id === project.id && pendingAction.type === "zip";
              const isBusy = !!pendingAction && pendingAction.id === project.id;

              return (
                <TableRow
                  key={project.id}
                  onClick={() => { window.location.href = `${editorUrl}/?projectId=${project.id}`; }}
                  className="hover:bg-secondary/20 transition-colors group cursor-pointer"
                >
                  <TableCell
                    onClick={(e) => e.stopPropagation()}
                    className="px-6 py-4 font-medium text-foreground flex items-center gap-3"
                  >
                    <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary group-hover:text-primary-foreground group-hover:bg-primary transition-all shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <Editable
                      defaultValue={project.name}
                      onSubmit={(val) => handleRename(project.id, val)}
                      autosize
                      className="flex items-center min-w-0"
                    >
                      <EditableArea className="flex items-center">
                        <EditablePreview asChild>
                          <div className="flex items-center gap-1.5 cursor-pointer group/preview select-none max-w-[240px] px-1.5 py-0.5 rounded border border-transparent">
                            <span className="truncate">{project.name}</span>
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/preview:opacity-100 transition-opacity shrink-0" />
                          </div>
                        </EditablePreview>
                        <EditableInput className="bg-background border border-primary px-1.5 py-0.5 rounded text-sm max-w-[240px] focus:outline-none focus:ring-1 focus:ring-primary" />
                      </EditableArea>
                    </Editable>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground font-light">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(project.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground font-light">
                    {new Date(project.updatedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()} className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link
                            href={`${editorUrl}/?projectId=${project.id}`}
                            className="inline-flex items-center justify-center h-8 w-8 text-xs font-semibold text-primary hover:text-primary-foreground hover:bg-primary transition-colors bg-secondary/50 rounded-lg border border-border"
                          >
                            <ArrowUpRight className="h-4 w-4" />
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>Open Editor</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownload(project.id, "pdf")}
                            disabled={isBusy}
                          >
                            {isPdfPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download PDF</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDownload(project.id, "zip")}
                            disabled={isBusy}
                          >
                            {isZipPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Download className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Download Source (ZIP)</TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="text-destructive hover:bg-destructive h-8 w-8 hover:text-white"
                            onClick={() => setDeleteId(project.id)}
                            disabled={isBusy}
                          >
                            {isDeletePending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete Project</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TooltipProvider>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteId) handleDelete(deleteId);
                setDeleteId(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
