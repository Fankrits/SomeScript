"use client";

import { useState } from "react";
import { FileText, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { purgeProject, restoreProject } from "@/app/dashboard/actions";
import { toast } from "sonner";
import { daysLeft } from "@/lib/utils";

interface TrashedProject {
  id: string;
  name: string;
  deletedAt: Date;
}

interface TrashTableProps {
  projects: TrashedProject[];
  retentionDays: number;
}

export default function TrashTable({ projects, retentionDays }: TrashTableProps) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [purgeId, setPurgeId] = useState<string | null>(null);

  const run = async (projectId: string, action: typeof restoreProject, successMessage: string) => {
    setPendingId(projectId);
    try {
      const result = await action(projectId);
      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success(successMessage);
      }
    } catch (error: any) {
      toast.error(error.message || "Something went wrong");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="border border-border rounded-xl bg-card overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-border bg-secondary/30 text-muted-foreground text-xs font-semibold uppercase tracking-wider hover:bg-transparent select-none">
              <TableHead className="px-6 py-4">Project Name</TableHead>
              <TableHead className="px-6 py-4">Deleted</TableHead>
              <TableHead className="px-6 py-4">Removed In</TableHead>
              <TableHead className="px-6 py-4 text-right w-[240px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border text-sm text-foreground">
            {projects.map((project) => {
              const left = daysLeft(new Date(project.deletedAt), retentionDays);
              const isBusy = pendingId === project.id;

              return (
                <TableRow key={project.id} className="hover:bg-secondary/20 transition-colors">
                  <TableCell className="px-6 py-4 font-medium text-foreground">
                    <span className="flex items-center gap-3">
                      <span className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0">
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="truncate max-w-[240px]">{project.name}</span>
                    </span>
                  </TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground font-light">
                    {new Date(project.deletedAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-muted-foreground font-light">
                    {left === 0 ? "Today" : left === 1 ? "1 day" : `${left} days`}
                  </TableCell>
                  <TableCell className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        disabled={isBusy}
                        onClick={() => run(project.id, restoreProject, "Project restored")}
                      >
                        {isBusy ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RotateCcw className="h-4 w-4" />
                        )}
                        Restore
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-destructive hover:bg-destructive hover:text-white"
                        disabled={isBusy}
                        onClick={() => setPurgeId(project.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete Forever
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={purgeId !== null} onOpenChange={(open) => !open && setPurgeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete permanently</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the project and all of its files for good. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (purgeId) void run(purgeId, purgeProject, "Project deleted permanently");
                setPurgeId(null);
              }}
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
