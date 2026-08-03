import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Eye, EyeOff, ListTodoIcon, Plus, Trash2, Pencil, GripVertical, ChevronDown, ChevronRight } from "lucide-react";
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
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
  DraggableProvidedDragHandleProps,
} from "@hello-pangea/dnd";

interface TasksPanelProps {
  projectId: string;
  onSelectMatch: (filePath: string, line: number) => void;
  onSelectPdfPage: (page: number) => void;
  /** Best-effort ping so other tabs on this project know to refetch (see use-collaboration.ts). */
  notifyTasksChanged?: () => void;
}

export interface TasksPanelHandle {
  addTask: (text: string, source?: Task["source"]) => void;
  /** Re-fetches from /api/tasks — called when a peer's notifyTasksChanged lands. */
  refresh: () => void;
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

function TaskItem({
  task,
  label,
  toggleDone,
  deleteTask,
  updateTask,
  goToSource,
  dragHandleProps,
}: {
  task: Task;
  label: string | null;
  toggleDone: (id: string) => void;
  deleteTask: (id: string) => void;
  updateTask: (id: string, name: string, description: string) => void;
  goToSource: (source: Task["source"]) => void;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(task.name);
  const [editDesc, setEditDesc] = useState(task.description || "");

  const handleSave = () => {
    if (!editName.trim()) return;
    updateTask(task.id, editName.trim(), editDesc.trim());
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditName(task.name);
    setEditDesc(task.description || "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 p-3 rounded-lg bg-muted/40 border border-border/60 shadow-sm transition-all duration-200">
        <Input
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          placeholder="Task name"
          className="h-8 text-xs font-medium bg-background"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") handleCancel();
          }}
        />
        <Textarea
          value={editDesc}
          onChange={(e) => setEditDesc(e.target.value)}
          placeholder="Description (optional)"
          className="text-xs min-h-[60px] resize-y bg-background"
          onKeyDown={(e) => {
            if (e.key === "Escape") handleCancel();
          }}
        />
        <div className="flex justify-end gap-2 mt-1">
          <Button variant="ghost" size="sm" className="h-7 px-3 text-[10px]" onClick={handleCancel}>
            Cancel
          </Button>
          <Button size="sm" className="h-7 px-3 text-[10px]" onClick={handleSave} disabled={!editName.trim()}>
            Save
          </Button>
        </div>
      </div>
    );
  }

  const statusColor = task.status === 'finished' ? "border-l-green-500" : task.status === 'ongoing' ? "border-l-orange-500" : "border-l-red-500";

  return (
    <div className={cn("flex items-start gap-2.5 p-2.5 rounded-lg text-xs transition-all duration-200 group border border-border/40 hover:border-border/60 hover:bg-muted/30 shadow-sm bg-background border-l-4", statusColor)}>
      <div
        {...dragHandleProps}
        className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground shrink-0 transition-colors"
      >
        <GripVertical className="size-4" />
      </div>
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => toggleDone(task.id)}
        className="mt-0.5 size-4 rounded border-border text-[#0f4c5c] focus:ring-[#0f4c5c] cursor-pointer shrink-0 transition-colors"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <div
          className={cn(
            "font-medium truncate transition-colors text-sm",
            task.done ? "line-through text-muted-foreground/60" : "text-foreground"
          )}
        >
          {task.name}
        </div>
        {task.description && (
          <div
            className={cn(
              "text-[11px] leading-relaxed line-clamp-3 transition-colors",
              task.done ? "line-through text-muted-foreground/50" : "text-muted-foreground"
            )}
          >
            {task.description}
          </div>
        )}
        {label && (
          <div className="mt-1 flex">
            <button
              type="button"
              onClick={() => goToSource(task.source)}
              className="inline-flex items-center text-[10px] font-mono text-muted-foreground/70 hover:text-[#0f4c5c] hover:bg-[#0f4c5c]/10 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
            >
              {label}
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          title="Edit task"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => deleteTask(task.id)}
          className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
          title="Delete task"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export const TasksPanel = forwardRef<TasksPanelHandle, TasksPanelProps>(
  ({ projectId, onSelectMatch, onSelectPdfPage, notifyTasksChanged }, ref) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [draft, setDraft] = useState("");
    const [isMounted, setIsMounted] = useState(false);

    // Collapsible states for sections
    const [sections, setSections] = useState({
      todo: true,
      ongoing: true,
      finished: false,
    });

    const toggleSection = (key: keyof typeof sections) => {
      setSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const [dialogOpen, setDialogOpen] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [descriptionDraft, setDescriptionDraft] = useState("");
    const [sourceDraft, setSourceDraft] = useState<Task["source"]>(undefined);

    // Counter, not a boolean: unlike the mount-only fetch this replaced,
    // loadTasks is also called imperatively (peer's notifyTasksChanged) and
    // can overlap with itself — only the response to the MOST RECENT call
    // should ever be allowed to land in state.
    const latestRequestRef = useRef(0);
    const loadTasks = useCallback(() => {
      const requestId = ++latestRequestRef.current;
      return fetch(`/api/tasks?projectId=${encodeURIComponent(projectId)}`)
        .then((r) => r.json())
        .then((data) => {
          if (requestId === latestRequestRef.current && Array.isArray(data?.tasks)) {
            setTasks(data.tasks);
          }
        })
        .catch(() => {});
    }, [projectId]);

    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe: DragDropContext reads the DOM and mismatches during hydration, so it only renders after mount
      setIsMounted(true);
      void loadTasks();
    }, [loadTasks]);

    const save = (next: Task[]) => {
      setTasks(next);
      fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, tasks: next }),
      })
        .then((r) => {
          if (r.ok) notifyTasksChanged?.();
          else toast.error("Failed to save tasks");
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
      refresh: loadTasks,
    }));

    const confirmAttach = () => {
      if (!nameDraft.trim()) return;
      const task: Task = {
        id: crypto.randomUUID(),
        name: nameDraft.trim(),
        description: descriptionDraft.trim() || undefined,
        done: false,
        status: "todo",
        createdAt: Date.now(),
        source: sourceDraft,
      };
      save([...tasks, task]);
      setDialogOpen(false);
      setSections((s) => ({ ...s, todo: true }));
    };

    const handleAdd = (e: React.FormEvent) => {
      e.preventDefault();
      if (!draft.trim()) return;
      const task: Task = {
        id: crypto.randomUUID(),
        name: draft.trim(),
        done: false,
        status: "todo",
        createdAt: Date.now(),
      };
      save([...tasks, task]);
      setDraft("");
      setSections((s) => ({ ...s, todo: true }));
    };

    const toggleDone = (id: string) => {
      save(
        tasks.map((t) => {
          if (t.id !== id) return t;
          const done = !t.done;
          return { ...t, done, status: done ? "finished" : "todo" };
        })
      );
    };

    const deleteTask = (id: string) => {
      save(tasks.filter((t) => t.id !== id));
    };

    const updateTask = (id: string, name: string, description: string) => {
      save(
        tasks.map((t) =>
          t.id === id ? { ...t, name, description: description || undefined } : t
        )
      );
    };

    const goToSource = (source: Task["source"]) => {
      if (!source) return;
      if (source.page !== undefined) onSelectPdfPage(source.page);
      else if (source.path !== undefined && source.line !== undefined) onSelectMatch(source.path, source.line);
    };

    const onDragEnd = (result: DropResult) => {
      if (!result.destination) return;
      const { source, destination } = result;

      if (source.droppableId === destination.droppableId && source.index === destination.index) {
        return;
      }

      const lists: Record<string, Task[]> = {
        todo: tasks.filter((t) => t.status === "todo"),
        ongoing: tasks.filter((t) => t.status === "ongoing"),
        finished: tasks.filter((t) => t.status === "finished"),
      };

      const sourceList = lists[source.droppableId];
      const destList = lists[destination.droppableId];

      const [movedTask] = sourceList.splice(source.index, 1);
      movedTask.status = destination.droppableId as Task["status"];
      movedTask.done = destination.droppableId === "finished";

      if (source.droppableId === destination.droppableId) {
        sourceList.splice(destination.index, 0, movedTask);
      } else {
        destList.splice(destination.index, 0, movedTask);
      }

      save([...lists.todo, ...lists.ongoing, ...lists.finished]);
    };

    const doneCount = tasks.filter((t) => t.status === "finished").length;
    const todoTasks = tasks.filter((t) => t.status === "todo");
    const ongoingTasks = tasks.filter((t) => t.status === "ongoing");
    const finishedTasks = tasks.filter((t) => t.status === "finished");

    const renderSection = (id: string, title: string, list: Task[], isOpen: boolean) => {
      const badgeColor = {
        todo: "bg-red-500/10 text-red-600 dark:text-red-400 group-hover:bg-red-500/20",
        ongoing: "bg-orange-500/10 text-orange-600 dark:text-orange-400 group-hover:bg-orange-500/20",
        finished: "bg-green-500/10 text-green-600 dark:text-green-400 group-hover:bg-green-500/20",
      }[id as 'todo' | 'ongoing' | 'finished'] || "bg-muted/50 text-muted-foreground";

      return (
      <div className="mb-4 last:mb-0">
        <button
          type="button"
          onClick={() => toggleSection(id as keyof typeof sections)}
          className="flex items-center w-full text-left gap-1.5 px-2 py-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors group cursor-pointer"
        >
          {isOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span>{title}</span>
          <span className={cn("ml-auto text-[10px] px-2 py-0.5 rounded-full transition-colors font-bold", badgeColor)}>
            {list.length}
          </span>
        </button>

        {isOpen && (
          <Droppable droppableId={id}>
            {(provided, snapshot) => (
              <div
                {...provided.droppableProps}
                ref={provided.innerRef}
                className={cn(
                  "min-h-[60px] p-1.5 mt-1 rounded-md transition-colors space-y-1.5",
                  snapshot.isDraggingOver ? "bg-muted/30" : "bg-transparent"
                )}
              >
                {list.map((task, index) => (
                  <Draggable key={task.id} draggableId={task.id} index={index}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        style={provided.draggableProps.style}
                        className={cn(
                          "transition-shadow rounded-lg",
                          snapshot.isDragging && "shadow-lg ring-1 ring-[#0f4c5c]/20"
                        )}
                      >
                        <TaskItem
                          task={task}
                          label={sourceLabel(task.source)}
                          toggleDone={toggleDone}
                          deleteTask={deleteTask}
                          updateTask={updateTask}
                          goToSource={goToSource}
                          dragHandleProps={provided.dragHandleProps}
                        />
                      </div>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
                {list.length === 0 && !snapshot.isDraggingOver && (
                  <div className="flex items-center justify-center h-14 border border-dashed border-border/50 rounded-lg text-[10px] text-muted-foreground/50 uppercase tracking-widest italic select-none">
                    Empty
                  </div>
                )}
              </div>
            )}
          </Droppable>
        )}
      </div>
      );
    };

    return (
      <div className="flex flex-col h-full bg-background select-none">
        <div className="flex items-center justify-between p-3 border-b border-border/60 bg-muted/5">
          <h2 className="font-semibold text-[11px] text-muted-foreground tracking-widest uppercase">Tasks Kanban</h2>
          {tasks.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-muted-foreground/70 bg-muted/40 px-1.5 py-0.5 rounded">
                {doneCount}/{tasks.length} done
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleAdd} className="p-3 border-b border-border/60 bg-muted/10">
          <div className="relative flex items-center group/form">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add a new task…"
              className="w-full bg-background border border-border/60 rounded-md pl-3 pr-8 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#0f4c5c]/20 focus:border-[#0f4c5c]/40 placeholder:text-muted-foreground/60 text-foreground transition-all shadow-sm"
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              className="absolute right-1.5 size-6 rounded-[4px] inline-flex items-center justify-center bg-[#0f4c5c] text-white hover:bg-[#0f4c5c]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-sm cursor-pointer"
              title="Add task"
            >
              <Plus className="size-4 stroke-[2.5]" />
            </button>
          </div>
        </form>

        <div className="flex-1 overflow-y-auto p-2">
          {isMounted ? (
            <DragDropContext onDragEnd={onDragEnd}>
              {renderSection("todo", "To Do", todoTasks, sections.todo)}
              {renderSection("ongoing", "On Going", ongoingTasks, sections.ongoing)}
              {renderSection("finished", "Finished", finishedTasks, sections.finished)}
            </DragDropContext>
          ) : (
            <div className="p-4 text-center text-xs text-muted-foreground">Loading board...</div>
          )}

          {tasks.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/40 mt-10">
              <ListTodoIcon className="w-12 h-12 mb-4" />
              <p className="text-xs uppercase tracking-widest font-semibold italic">Start Planning</p>
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
              <Button onClick={confirmAttach} disabled={!nameDraft.trim()} className="bg-[#0f4c5c] text-white hover:bg-[#0f4c5c]/90">
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
