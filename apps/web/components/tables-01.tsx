"use client";

import { useState } from "react";
import { FileText, Calendar, ArrowUpRight, Download, FileDown, Trash2, Loader2, Pencil, ArrowUpDown, ArrowUp, ArrowDown, MoreVertical } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameInput, setRenameInput] = useState<string>("");
  const [isRenaming, setIsRenaming] = useState<boolean>(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [editingMobileId, setEditingMobileId] = useState<string | null>(null);

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
      const result = await renameProject(projectId, newName);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Project renamed successfully");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to rename project");
    }
  };

  const handleDelete = async (projectId: string) => {
    setPendingAction({ id: projectId, type: "delete" });
    try {
      const result = await deleteProject(projectId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success("Project deleted successfully");
      }
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
      setTimeout(() => {
        setPendingAction(null);
      }, 800);
    }
  };

  return (
    <div className="space-y-4">
      <TooltipProvider>
        {/* Mobile View: Compact Cards List (< 768px) */}
        <div className="md:hidden flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1 text-xs text-muted-foreground font-mono font-medium">
            <span>{projects.length} Projects</span>
            <button
              onClick={() => requestSort("updatedAt")}
              className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
            >
              Sort by Date {getSortIcon("updatedAt")}
            </button>
          </div>

          {sortedProjects.map((project) => {
            const isDeletePending = pendingAction?.id === project.id && pendingAction.type === "delete";
            const isPdfPending = pendingAction?.id === project.id && pendingAction.type === "pdf";
            const isZipPending = pendingAction?.id === project.id && pendingAction.type === "zip";
            const isBusy = !!pendingAction && pendingAction.id === project.id;
            const isEditingThisMobile = editingMobileId === project.id;

            return (
              <div
                key={project.id}
                onClick={() => {
                  setOpeningId(project.id);
                  window.location.href = `${editorUrl}/?projectId=${project.id}`;
                }}
                className="border border-border rounded-xl bg-card p-3 shadow-xs flex items-center justify-between gap-3 cursor-pointer hover:border-primary/40 transition-all group"
              >
                {/* Left: Icon + Title & Date */}
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary group-hover:text-primary-foreground group-hover:bg-primary transition-all shrink-0">
                    {openingId === project.id ? (
                      <Loader2 className="h-4.5 w-4.5 animate-spin" />
                    ) : (
                      <FileText className="h-4.5 w-4.5" />
                    )}
                  </div>

                  <div className="flex flex-col items-start justify-center min-w-0 flex-1 text-left">
                    <span className="font-semibold text-xs sm:text-sm text-foreground truncate text-left w-full">
                      {project.name}
                    </span>

                    <span className="text-[10px] text-muted-foreground font-light flex items-center justify-start gap-1 mt-0.5 text-left">
                      <Calendar className="h-2.5 w-2.5 shrink-0" />
                      {new Date(project.updatedAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>

                {/* Right: Primary "Open" button + 3-Dot Dropdown */}
                <div onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 shrink-0">
                  <Link
                    href={`${editorUrl}/?projectId=${project.id}`}
                    onClick={() => setOpeningId(project.id)}
                    className="inline-flex items-center justify-center gap-1 h-8 px-2.5 text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 transition-colors rounded-lg shadow-xs"
                  >
                    <span>Open</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>

                  {/* 3-Dot Dropdown Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Project options</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem
                        onClick={() => {
                          setRenameTarget({ id: project.id, name: project.name });
                          setRenameInput(project.name);
                        }}
                      >
                        <Pencil className="mr-2 h-4 w-4 text-blue-500" />
                        <span>Rename Project</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDownload(project.id, "pdf")} disabled={isBusy}>
                        {isPdfPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4 text-primary" />}
                        <span>Download PDF</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDownload(project.id, "zip")} disabled={isBusy}>
                        {isZipPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4 text-emerald-500" />}
                        <span>Download Source</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteId(project.id)} disabled={isBusy} variant="destructive">
                        {isDeletePending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        <span>Delete Project</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop View: Full Table (>= 768px) */}
        <div className="hidden md:block border border-border rounded-xl bg-card overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
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
                      onClick={() => {
                        setOpeningId(project.id);
                        window.location.href = `${editorUrl}/?projectId=${project.id}`;
                      }}
                      className="hover:bg-secondary/20 transition-colors group cursor-pointer"
                    >
                      <TableCell
                        className="px-6 py-4 font-medium text-foreground flex items-center justify-start gap-3 text-left"
                      >
                        <div className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-primary group-hover:text-primary-foreground group-hover:bg-primary transition-all shrink-0">
                          {openingId === project.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <FileText className="h-4 w-4" />
                          )}
                        </div>
                        <Editable
                          defaultValue={project.name}
                          onSubmit={(val) => handleRename(project.id, val)}
                          autosize
                          className="flex flex-col items-start justify-start min-w-0 text-left gap-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <EditableArea className="flex items-center justify-start text-left">
                            <EditablePreview asChild>
                              <div className="flex items-center justify-start gap-1.5 cursor-pointer group/preview select-none max-w-[240px] px-1.5 py-0.5 rounded border border-transparent text-left">
                                <span className="truncate text-left">{project.name}</span>
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover/preview:opacity-100 transition-opacity shrink-0" />
                              </div>
                            </EditablePreview>
                            <EditableInput className="bg-background border border-primary px-1.5 py-0.5 rounded text-sm max-w-[240px] focus:outline-none focus:ring-1 focus:ring-primary text-left" />
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
                                onClick={() => setOpeningId(project.id)}
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
          </div>
        </div>
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

      {/* Rename Modal */}
      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Enter a new name for your LaTeX document.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!renameTarget || !renameInput.trim() || isRenaming) return;
              setIsRenaming(true);
              try {
                await handleRename(renameTarget.id, renameInput.trim());
                setRenameTarget(null);
              } finally {
                setIsRenaming(false);
              }
            }}
            className="space-y-4 pt-2"
          >
            <Input
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              placeholder="Project name"
              autoFocus
            />

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setRenameTarget(null)}
                disabled={isRenaming}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRenaming || !renameInput.trim()}>
                {isRenaming ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
