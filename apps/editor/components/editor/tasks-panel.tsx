import React, { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Eye, EyeOff, ListTodoIcon, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/tasks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface TasksPanelProps {
  projectId: string;
  onSelectMatch: (filePath: string, line: number) => void;
  onSelectPdfPage: (page: number) => void;
}

export interface TasksPanelHandle {
  addTask: (text: string, source?: Task["source"]) => void;
}

function sourceLabel(source: Task["source"]): string | null {
  if (!source) return null;
  if (source.page !== undefined) return `p. ${source.page}`;
  if (source.path === undefined) return null;
  if (source.line === undefined) return source.path;
  return source.endLine && source.endLine !== source.line
    ? `${source.path}:${source.line}-${source.endLine}`
    : `${source.path}:${source.line}`;
}

export const TasksPanel = forwardRef<TasksPanelHandle, TasksPanelProps>(
  ({ projectId, onSelectMatch, onSelectPdfPage }, ref) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [draft, setDraft] = useState("");
    const [showCompleted, setShowCompleted] = useState(false);

    // Attach-from-selection dialog: addTask() below fills these and opens it,
    // rather than saving immediately, so the selection can be named before it
    // becomes a task.
    const [dialogOpen, setDialogOpen] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [sourceDraft, setSourceDraft] = useState<Task["source"]>(undefined);

    useEffect(() => {
      let cancelled = false;
      fetch(`/api/tasks?projectId=${encodeURIComponent(projectId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (!cancelled && Array.isArray(data?.tasks)) setTasks(data.tasks);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [projectId]);

    const save = (next: Task[]) => {
      setTasks(next);
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, tasks: next }),
      })
        .then((r) => {
          if (!r.ok) toast.error("Failed to save tasks");
        })
        .catch(() => toast.error("Failed to save tasks"));
    };

    useImperativeHandle(ref, () => ({
      addTask: (text: string, source?: Task["source"]) => {
        const firstLine = text.split("\n")[0]?.trim() ?? "";
        setNameDraft(firstLine.length > 60 ? `${firstLine.slice(0, 60)}…` : firstLine);
        setDescriptionDraft(text.trim());
        setSourceDraft(source);
        setDialogOpen(true);
      },
    }));

    const confirmAttach = () => {
      if (!nameDraft.trim()) return;
      const task: Task = {
        id: crypto.randomUUID(),
        name: nameDraft.trim(),
        description: descriptionDraft.trim() || undefined,
        done: false,
        createdAt: Date.now(),
        source: sourceDraft,
      };
      save([...tasks, task]);
      setDialogOpen(false);
    };

    const handleAdd = (e: React.FormEvent) => {
      e.preventDefault();
      if (!draft.trim()) return;
      const task: Task = { id: crypto.randomUUID(), name: draft.trim(), done: false, createdAt: Date.now() };
      save([...tasks, task]);
      setDraft("");
    };

    const toggleDone = (id: string) => {
      save(tasks.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
    };

    const deleteTask = (id: string) => {
      save(tasks.filter((t) => t.id !== id));
    };

    const goToSource = (source: Task["source"]) => {
      if (!source) return;
      if (source.page !== undefined) onSelectPdfPage(source.page);
      else if (source.path !== undefined && source.line !== undefined) onSelectMatch(source.path, source.line);
    };

    const doneCount = tasks.filter((t) => t.done).length;
    // Completed tasks stay out of the list by default so it reflects what's left to do;
    // the header toggle reveals them without changing what's stored.
    const visibleTasks = tasks.filter((t) => showCompleted || !t.done);

    return (
      <div className="flex flex-col h-full bg-background select-none">
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/10">
          <h2 className="font-semibold text-[10px] text-muted-foreground tracking-wider uppercase">Tasks</h2>
          {tasks.length > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">
                {doneCount}/{tasks.length} done
              </span>
              {doneCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCompleted((v) => !v)}
                  className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
                  title={showCompleted ? "Hide completed" : "Show completed"}
                >
                  {showCompleted ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              )}
            </div>
          )}
        </div>

        <form onSubmit={handleAdd} className="p-3 border-b border-border bg-background/50">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a task…"
            className="w-full bg-muted/30 border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground text-foreground"
          />
        </form>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
          {visibleTasks.map((task) => {
            const label = sourceLabel(task.source);
            return (
              <div
                key={task.id}
                className="flex items-start gap-2 px-2.5 py-2 rounded-md text-xs transition-all duration-150 group border border-transparent hover:bg-muted/40"
              >
                <input
                  type="checkbox"
                  checked={task.done}
                  onChange={() => toggleDone(task.id)}
                  className="mt-0.5 size-4 rounded border-border text-primary focus:ring-primary cursor-pointer shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className={cn("truncate", task.done && "line-through text-muted-foreground")}>
                    {task.name}
                  </div>
                  {task.description && (
                    <div
                      className={cn(
                        "text-[11px] text-muted-foreground line-clamp-2 mt-0.5",
                        task.done && "line-through"
                      )}
                    >
                      {task.description}
                    </div>
                  )}
                  {label && (
                    <button
                      type="button"
                      onClick={() => goToSource(task.source)}
                      className="text-[10px] font-mono text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    >
                      {label}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteTask(task.id)}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all duration-150 cursor-pointer shrink-0"
                  title="Delete task"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}

          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/40 mt-10">
              <ListTodoIcon className="w-12 h-12 mb-4" />
              <p className="text-xs uppercase tracking-widest font-semibold italic">No tasks yet</p>
            </div>
          )}

          {tasks.length > 0 && visibleTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/40 mt-10">
              <ListTodoIcon className="w-12 h-12 mb-4" />
              <p className="text-xs uppercase tracking-widest font-semibold italic">All done</p>
            </div>
          )}
        </div>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New task from selection</DialogTitle>
              <DialogDescription>
                Name the task — the selected text is attached as its description.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="task-name-input">Name</Label>
                <Input
                  id="task-name-input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAttach();
                  }}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="task-description-input">Description</Label>
                <Textarea
                  id="task-description-input"
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  rows={6}
                  className="text-xs font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={confirmAttach} disabled={!nameDraft.trim()}>
                Add task
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }
);

TasksPanel.displayName = "TasksPanel";
