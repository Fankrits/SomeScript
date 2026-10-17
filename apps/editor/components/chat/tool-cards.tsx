"use client";

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
  Globe,
  ListChecks,
  ListTree,
  Loader2,
  Play,
  Square,
  Terminal,
  Undo2,
  Wrench,
  X,
  ShieldAlert,
  MessageCircleQuestion,
  CheckCircle,
  XCircle,
  Bot,
} from "lucide-react";
import { toast } from "sonner";
import { DiffViewer } from "@/components/diff-viewer";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import Ansi from "ansi-to-react";
import type { Todo, ToolPart, ToolStatus } from "./types";
import { useEveAgentCtx } from "@/components/chat/eve-agent-context";

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
  useEffect(() => {
    if (props.open) setOpen(true);
  }, [props.open]);
  const expandable = Boolean(children);
  return (
    <Collapsible
      open={expandable && open}
      onOpenChange={setOpen}
      data-testid={props.testId}
      className="rounded-lg border border-border/60 bg-muted/20 text-xs my-1"
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

async function postFiles(body: R): Promise<boolean> {
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

function UndoButton(props: {
  label: string;
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
      className="rounded-lg border border-border/60 bg-muted/20 p-2 text-xs my-1"
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

export function HitlCard({ part }: { part: ToolPart }) {
  let agent: ReturnType<typeof useEveAgentCtx> | null = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    agent = useEveAgentCtx();
  } catch {
    agent = null;
  }

  const inputRequest = part.inputRequest;
  const status = part.status;
  const [submitted, setSubmitted] = useState(false);

  if (!inputRequest) return null;

  if (submitted || status === "done" || status === "error") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 px-1">
        <CheckCircle className="size-3.5 text-green-500" />
        <span>Response submitted.</span>
      </div>
    );
  }

  const isApproval = inputRequest.display === "confirmation" || !inputRequest.options;
  const options = inputRequest.options;

  const handleAnswer = (optionId: string) => {
    if (!agent) return;
    setSubmitted(true);
    agent.respond([{ requestId: inputRequest.requestId, optionId }]).catch(() => {
      setSubmitted(false);
      toast.error("Failed to submit response");
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-3 my-2 space-y-2 shadow-sm text-xs">
      <div className="flex items-center gap-2">
        {isApproval ? (
          <ShieldAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        ) : (
          <MessageCircleQuestion className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
        )}
        <p className="font-semibold text-sm text-foreground">
          {isApproval ? "Approval Required" : "Question"}
        </p>
      </div>

      <p className="text-foreground break-words">{inputRequest.prompt}</p>

      {options && options.length > 0 ? (
        <div role="group" aria-label="Response options" className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
          {options.map((opt) => (
            <Button
              key={opt.id}
              size="sm"
              variant={
                opt.style === "primary"
                  ? "default"
                  : opt.style === "danger"
                    ? "destructive"
                    : "outline"
              }
              onClick={() => handleAnswer(opt.id)}
              disabled={submitted}
              className="h-auto min-h-8 justify-start py-1.5 px-2.5 text-left text-xs whitespace-normal"
            >
              {opt.label}
            </Button>
          ))}
        </div>
      ) : (
        <div role="group" aria-label="Response options" className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" onClick={() => handleAnswer("approve")} disabled={submitted}>
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleAnswer("reject")}
            disabled={submitted}
          >
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}

export function ToolCard({ part, projectId }: { part: ToolPart; projectId: string }) {
  const { name, args, status } = part;
  const r = (part.result ?? { ok: false }) as R;
  const failed = status === "error";
  const running = status === "running";
  const path = str(r.path) || str(args.path);
  const errorLine = failed ? (
    <Mono>{str(r.error) || part.output || "The tool failed."}</Mono>
  ) : undefined;

  // Handle HITL first
  if (name === "ask_question" || name === "__hitl__" || Boolean(part.inputRequest)) {
    return <HitlCard part={part} />;
  }

  const normalizedName = name.replace(/-/g, "_");

  switch (normalizedName) {
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
      const after = typeof r.after === "string" ? r.after : typeof args.content === "string" ? args.content : null;
      const created = r.created === true;
      const verb = normalizedName === "edit_file" ? "Edited" : created ? "Created" : "Rewrote";
      const canUndo = !running && !failed && (created || before !== null);
      return (
        <Row
          testId={`tool-${name}`}
          icon={created ? <FilePlus /> : <FilePen />}
          title={
            running
              ? `${normalizedName === "edit_file" ? "Editing" : "Writing"} ${str(args.path)}…`
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
                    ? postFiles({ projectId, action: "delete", path })
                    : postFiles({ projectId, action: "save", path, content: before })
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
                run={() => postFiles({ projectId, action: "save", path, content: before })}
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
                run={() => postFiles({ projectId, action: "move", oldPath: to, newPath: from })}
              />
            )
          }
        >
          {errorLine}
        </Row>
      );
    }
    case "compile_project":
    case "read_compile_log": {
      const errors = Array.isArray(r.errors) ? (r.errors as R[]) : [];
      const log = str(r.log);
      return (
        <Row
          testId={`tool-${name}`}
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
                <div className="border-t border-border/60 p-2 overflow-x-auto">
                  <Ansi className="font-mono text-[11px] whitespace-pre-wrap">{log}</Ansi>
                </div>
              )}
            </>
          ) : undefined}
        </Row>
      );
    }
    case "bash": {
      return (
        <Row
          testId="tool-bash"
          icon={<Terminal />}
          title={running ? "Running command…" : `Terminal: ${str(args.command) || "command"}`}
          status={status}
        >
          <div className="overflow-hidden rounded-md bg-zinc-950 p-2 font-mono text-[11px] text-zinc-100">
            <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap text-green-400">
              $ {str(args.command)}
            </pre>
            {Boolean(part.output || r.output) && (
              <pre className="mt-1 max-h-60 overflow-x-auto border-t border-zinc-800/50 pt-1 whitespace-pre-wrap text-zinc-300">
                {str(r.output) || part.output}
              </pre>
            )}
          </div>
        </Row>
      );
    }
    case "web_search": {
      return (
        <Row
          testId="tool-web_search"
          icon={<Globe />}
          title={running ? "Searching web…" : `Web search: ${str(args.query) || "…"}`}
          status={status}
        >
          {part.output ? <Mono>{part.output}</Mono> : undefined}
        </Row>
      );
    }
    case "web_fetch": {
      return (
        <Row
          testId="tool-web_fetch"
          icon={<Globe />}
          title={running ? "Fetching webpage…" : `Fetch: ${str(args.url) || "…"}`}
          status={status}
        >
          {part.output ? <Mono>{part.output}</Mono> : undefined}
        </Row>
      );
    }
    case "subagent":
    case "__subagent__": {
      return (
        <Row
          testId="tool-subagent"
          icon={<Bot />}
          title={`Sub-agent: ${str(args.toolName) || "delegating…"}`}
          status={status}
        />
      );
    }
    case "todo":
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
