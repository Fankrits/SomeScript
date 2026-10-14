import { useEffect, useState, type ReactNode } from "react";
import {
  Check,
  ChevronRight,
  CircleDashed,
  FilePen,
  FilePlus,
  FileSearch,
  FileText,
  FileX,
  FolderInput,
  ListChecks,
  ListTree,
  Loader2,
  Play,
  Square,
  Undo2,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DiffViewer } from "@/components/diff-viewer";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import type { Todo, ToolPart, ToolStatus } from "./types";

type R = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === "running")
    return <Loader2 className="size-3.5 animate-spin text-muted-foreground" />;
  if (status === "error") return <X className="size-3.5 text-destructive" />;
  if (status === "stopped") return <Square className="size-3 text-muted-foreground" />;
  return <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />;
}

/** One collapsed line per tool call; the body (a diff, a file list, a log) opens on click. */
function Row(props: {
  icon: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  status: ToolStatus;
  open?: boolean;
  actions?: ReactNode;
  children?: ReactNode;
  testId?: string;
}) {
  const { icon, title, detail, status, children, actions } = props;
  const [open, setOpen] = useState(props.open ?? false);
  // A diff or an error list opens by itself the moment the call finishes (it was running, so the
  // initial state was closed); later it stays however the user left it.
  useEffect(() => {
    if (props.open) setOpen(true);
  }, [props.open]);
  const expandable = Boolean(children);
  return (
    <Collapsible
      open={expandable && open}
      onOpenChange={setOpen}
      data-testid={props.testId}
      className="rounded-lg border border-border/60 bg-muted/20 text-xs"
    >
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <CollapsibleTrigger
          disabled={!expandable}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-1.5 text-left",
            expandable ? "cursor-pointer" : "cursor-default",
          )}
        >
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground transition-transform",
              !expandable && "opacity-0",
              open && "rotate-90",
            )}
          />
          <span className="shrink-0 text-muted-foreground [&_svg]:size-3.5">{icon}</span>
          <span className="min-w-0 truncate font-medium">{title}</span>
          {detail && (
            <span className="min-w-0 shrink truncate text-muted-foreground">{detail}</span>
          )}
        </CollapsibleTrigger>
        {actions}
        <StatusIcon status={status} />
      </div>
      {expandable && (
        <CollapsibleContent className="border-t border-border/60">{children}</CollapsibleContent>
      )}
    </Collapsible>
  );
}

async function post(body: R): Promise<boolean> {
  try {
    const res = await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function currentContent(projectId: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.content === "string" ? data.content : null;
  } catch {
    return null;
  }
}

/**
 * Undo for a file change the assistant made. If the file was edited again since (by the user or
 * a later step), a plain undo would throw that work away, so it asks first.
 */
function UndoButton(props: {
  label: string;
  /** What the file should hold now, if it still holds this; null when there's no such check. */
  expect: string | null;
  projectId: string;
  path: string;
  run: () => Promise<boolean>;
}) {
  const [state, setState] = useState<"idle" | "confirm" | "busy" | "done">("idle");

  const perform = async () => {
    setState("busy");
    const ok = await props.run();
    if (ok) {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
      toast.success(`${props.label} undone`);
      setState("done");
    } else {
      toast.error("Couldn't undo that change");
      setState("idle");
    }
  };

  const start = async () => {
    if (props.expect !== null) {
      const now = await currentContent(props.projectId, props.path);
      if (now !== props.expect) {
        setState("confirm");
        return;
      }
    }
    await perform();
  };

  if (state === "done") return <span className="px-1 text-muted-foreground">Undone</span>;
  if (state === "confirm") {
    return (
      <span className="flex items-center gap-1">
        <span className="text-muted-foreground">Changed since. Undo anyway?</span>
        <Button size="xs" variant="destructive" onClick={() => void perform()}>
          Undo
        </Button>
        <Button size="xs" variant="ghost" onClick={() => setState("idle")}>
          Keep
        </Button>
      </span>
    );
  }
  return (
    <Button
      size="xs"
      variant="ghost"
      disabled={state === "busy"}
      onClick={(e) => {
        e.stopPropagation();
        void start();
      }}
      aria-label={`Undo: ${props.label}`}
    >
      <Undo2 /> Undo
    </Button>
  );
}

export function TodoList({ todos }: { todos: Todo[] }) {
  const done = todos.filter((t) => t.status === "completed").length;
  return (
    <div
      data-testid="todo-list"
      className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs"
    >
      <div className="mb-1.5 flex items-center gap-1.5 font-medium">
        <ListChecks className="size-3.5 text-muted-foreground" />
        Plan
        <span className="ml-auto font-normal text-muted-foreground">
          {done}/{todos.length}
        </span>
      </div>
      <ul className="grid gap-1">
        {todos.map((t, i) => (
          <li key={i} className="flex items-start gap-1.5">
            {t.status === "completed" ? (
              <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : t.status === "in_progress" ? (
              <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <CircleDashed className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            )}
            <span
              className={cn(
                t.status === "completed" && "text-muted-foreground line-through",
                t.status === "in_progress" && "font-medium",
              )}
            >
              {t.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const Mono = ({ children }: { children: ReactNode }) => (
  <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words p-2 font-mono text-[11px] leading-relaxed">
    {children}
  </pre>
);

export function ToolCard({ part, projectId }: { part: ToolPart; projectId: string }) {
  const { name, args, status } = part;
  const r = (part.result ?? { ok: false }) as R;
  const failed = status === "error";
  const running = status === "running";
  const path = str(r.path) || str(args.path);
  const errorLine = failed ? (
    <Mono>{str(r.error) || part.output || "The tool failed."}</Mono>
  ) : undefined;

  switch (name) {
    case "list_files": {
      const files = Array.isArray(r.files) ? (r.files as string[]) : [];
      const pattern = str(args.pattern);
      return (
        <Row
          testId="tool-list_files"
          icon={<ListTree />}
          title={running ? "Listing files…" : "Listed files"}
          detail={
            failed
              ? undefined
              : [pattern, !running && plural(num(r.total) ?? files.length, "file")]
                  .filter(Boolean)
                  .join(" · ")
          }
          status={status}
        >
          {failed ? errorLine : files.length > 0 && <Mono>{files.join("\n")}</Mono>}
        </Row>
      );
    }
    case "read_file": {
      const first = num(r.firstLine);
      const last = num(r.lastLine);
      return (
        <Row
          testId="tool-read_file"
          icon={<FileText />}
          title={running ? `Reading ${str(args.path)}…` : `Read ${path}`}
          detail={
            !running && !failed && first !== null && last !== null
              ? `lines ${first}–${last}`
              : undefined
          }
          status={status}
        >
          {errorLine}
        </Row>
      );
    }
    case "grep": {
      const matches = Array.isArray(r.matches) ? (r.matches as R[]) : [];
      return (
        <Row
          testId="tool-grep"
          icon={<FileSearch />}
          title={running ? "Searching…" : `Searched for “${str(args.query)}”`}
          detail={running || failed ? undefined : plural(matches.length, "match", "matches")}
          status={status}
        >
          {failed ? (
            errorLine
          ) : matches.length > 0 ? (
            <Mono>
              {matches.map((m) => `${str(m.path)}:${num(m.line) ?? ""}  ${str(m.text)}`).join("\n")}
            </Mono>
          ) : undefined}
        </Row>
      );
    }
    case "edit_file":
    case "write_file": {
      const before = typeof r.before === "string" ? r.before : null;
      const after = typeof r.after === "string" ? r.after : null;
      const created = r.created === true;
      const verb = name === "edit_file" ? "Edited" : created ? "Created" : "Rewrote";
      const canUndo = !running && !failed && (created || before !== null);
      return (
        <Row
          testId={`tool-${name}`}
          icon={created ? <FilePlus /> : <FilePen />}
          title={
            running
              ? `${name === "edit_file" ? "Editing" : "Writing"} ${str(args.path)}…`
              : `${verb} ${path}`
          }
          status={status}
          open={!running && !failed && after !== null && (before !== null || created)}
          actions={
            canUndo && (
              <UndoButton
                label={`${verb} ${path}`}
                expect={after}
                projectId={projectId}
                path={path}
                run={() =>
                  created && before === null
                    ? post({ projectId, action: "delete", path })
                    : post({ projectId, action: "save", path, content: before })
                }
              />
            )
          }
        >
          {failed ? (
            errorLine
          ) : after !== null ? (
            <div className="max-h-72 overflow-auto">
              <DiffViewer oldCode={before ?? ""} newCode={after} language="latex" />
            </div>
          ) : undefined}
        </Row>
      );
    }
    case "delete_file": {
      const before = typeof r.before === "string" ? r.before : null;
      return (
        <Row
          testId="tool-delete_file"
          icon={<FileX />}
          title={running ? `Deleting ${str(args.path)}…` : `Deleted ${path}`}
          status={status}
          actions={
            !running &&
            !failed &&
            before !== null && (
              <UndoButton
                label={`Deleted ${path}`}
                expect={null}
                projectId={projectId}
                path={path}
                run={() => post({ projectId, action: "save", path, content: before })}
              />
            )
          }
        >
          {errorLine}
        </Row>
      );
    }
    case "move_file": {
      const from = str(r.from) || str(args.from);
      const to = str(r.to) || str(args.to);
      return (
        <Row
          testId="tool-move_file"
          icon={<FolderInput />}
          title={running ? "Moving…" : "Moved"}
          detail={`${from} → ${to}`}
          status={status}
          actions={
            !running &&
            !failed && (
              <UndoButton
                label={`Moved ${from}`}
                expect={null}
                projectId={projectId}
                path={to}
                run={() => post({ projectId, action: "move", oldPath: to, newPath: from })}
              />
            )
          }
        >
          {errorLine}
        </Row>
      );
    }
    case "compile_project": {
      const errors = Array.isArray(r.errors) ? (r.errors as R[]) : [];
      const log = str(r.log);
      return (
        <Row
          testId="tool-compile_project"
          icon={<Play />}
          title={
            running
              ? "Compiling…"
              : failed
                ? errors.length > 0
                  ? `Compile failed`
                  : "Couldn't compile"
                : "Compiled"
          }
          detail={
            running
              ? undefined
              : failed && errors.length > 0
                ? plural(errors.length, "error")
                : path || undefined
          }
          status={status}
          open={failed && errors.length > 0}
        >
          {errors.length > 0 || log || failed ? (
            <>
              {errors.length > 0 && (
                <ul className="grid gap-1 p-2">
                  {errors.map((e, i) => (
                    <li key={i} className="font-mono text-[11px]">
                      <span className="text-muted-foreground">
                        {str(e.file)}:{num(e.line)}
                      </span>{" "}
                      {str(e.message)}
                    </li>
                  ))}
                </ul>
              )}
              {errors.length === 0 && failed && !log && <Mono>{str(r.error) || part.output}</Mono>}
              {log && (
                <details className="border-t border-border/60 px-2 py-1">
                  <summary className="cursor-pointer text-muted-foreground">Compile log</summary>
                  <Mono>{log}</Mono>
                </details>
              )}
            </>
          ) : undefined}
        </Row>
      );
    }
    case "todo_write": {
      const todos = Array.isArray(r.todos) ? (r.todos as Todo[]) : null;
      return todos ? <TodoList todos={todos} /> : null;
    }
    default:
      return (
        <Row testId={`tool-${name}`} icon={<Wrench />} title={name} status={status}>
          {part.output ? <Mono>{part.output}</Mono> : undefined}
        </Row>
      );
  }
}
