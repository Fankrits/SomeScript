"use client";

import React, { useMemo, useState } from "react";
import {
  ShieldAlert,
  Bot,
  CheckCircle,
  XCircle,
  Search,
  Terminal,
  FileText,
  CheckSquare,
  RotateCcw,
  Undo2,
} from "lucide-react";
import { structuredPatch } from "diff";
import { Button } from "@/components/ui/button";
import { useEveAgentCtx } from "@/components/chat/eve-agent-context";
import { makeAssistantToolUI } from "@assistant-ui/react";
import { DiffViewer } from "@/components/diff-viewer";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Shape of the write-file tool's structured input/output as it reaches the UI.
type WriteFileInput = { projectId?: string; path?: string; content?: string };
type WriteFileOutput = {
  ok?: boolean;
  path?: string;
  before?: string | null;
  created?: boolean;
  error?: string;
};

async function fetchFileContent(projectId: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`
    );
    if (!res.ok) return null; // 404 => file doesn't exist (treated as empty/new)
    const data = await res.json();
    return typeof data.content === "string" ? data.content : null;
  } catch {
    return null;
  }
}

async function postFiles(body: Record<string, unknown>): Promise<boolean> {
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

// Loosely-structured args carried by Eve tool calls; every field is optional
// because each card reads only the subset relevant to its tool.
interface ToolCardArgs {
  inputRequest?: {
    requestId: string;
    prompt?: string;
    display?: string;
    options?: Array<{ id: string; label: string; style?: string }>;
  };
  state?: string;
  input?: unknown;
  displayName?: string;
  description?: string;
  authorization?: { userCode?: string; url?: string; instructions?: string };
  outcome?: string;
  toolName?: string;
  query?: string;
  command?: string;
  path?: string;
  action?: string;
}

// ---------------------------------------------------------------------------
// HITL — Human-in-the-Loop approval + ask_question prompt
// ---------------------------------------------------------------------------
function HitlCard({ args }: { args: ToolCardArgs }) {
  const agent = useEveAgentCtx();
  const inputRequest = args.inputRequest;
  const state = args.state;
  const [submitted, setSubmitted] = useState(false);

  if (!inputRequest) return null;

  // Already responded — show confirmation
  if (state === "approval-responded" || submitted) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
        <CheckCircle className="size-3.5 text-green-500" />
        <span>Response submitted.</span>
      </div>
    );
  }

  const handleAnswer = (optionId: string) => {
    setSubmitted(true);
    void agent.send({
      inputResponses: [{ requestId: inputRequest.requestId, optionId }],
    });
  };

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20 p-4 mt-2 space-y-3">
      <div className="flex items-center gap-2">
        <ShieldAlert className="size-4 text-amber-600 dark:text-amber-400" />
        <p className="font-semibold text-sm text-amber-800 dark:text-amber-300">
          {inputRequest.display === "confirmation" || !inputRequest.options
            ? "Approval Required"
            : "Question"}
        </p>
      </div>

      <p className="text-sm text-foreground">{inputRequest.prompt}</p>

      {/* Show tool input for transparency on approvals */}
      {!!args.input && inputRequest.display === "confirmation" && (
        <pre className="text-xs bg-muted/65 p-2 rounded overflow-x-auto max-h-40 font-mono">
          {JSON.stringify(args.input, null, 2)}
        </pre>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {inputRequest.options && inputRequest.options.length > 0 ? (
          inputRequest.options.map((opt) => (
            <Button
              key={opt.id}
              size="sm"
              variant={opt.style === "primary" ? "default" : opt.style === "danger" ? "destructive" : "outline"}
              onClick={() => handleAnswer(opt.id)}
              disabled={submitted}
            >
              {opt.label}
            </Button>
          ))
        ) : (
          // Default approve / reject buttons for bare tool approvals
          <>
            <Button
              size="sm"
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => handleAnswer("approve")}
              disabled={submitted}
            >
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
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OAuth / Connection authorization prompt
// ---------------------------------------------------------------------------
function OAuthCard({ args }: { args: ToolCardArgs }) {
  const { displayName, description, authorization, state, outcome } = args;

  if (state === "completed") {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
        {outcome === "authorized" ? (
          <CheckCircle className="size-3.5 text-green-500" />
        ) : (
          <XCircle className="size-3.5 text-red-500" />
        )}
        <span>
          {displayName}:{" "}
          {outcome === "authorized" ? "Authorized successfully" : "Authorization failed"}
        </span>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 mt-2 space-y-3 bg-card shadow-sm">
      <p className="font-semibold text-sm text-foreground">
        {displayName} — Authorization Required
      </p>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {authorization?.userCode && (
        <div className="bg-muted p-2 rounded text-center">
          <span className="text-xs text-muted-foreground block mb-1">User Code</span>
          <code className="text-lg font-mono font-bold tracking-widest">
            {authorization.userCode}
          </code>
        </div>
      )}
      {authorization?.url && (
        <a
          href={authorization.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center py-2 px-3 bg-primary text-primary-foreground text-xs font-semibold rounded hover:bg-primary/90 transition-colors"
        >
          Authorize Connection →
        </a>
      )}
      {authorization?.instructions && (
        <p className="text-xs text-muted-foreground italic">{authorization.instructions}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subagent delegation card
// ---------------------------------------------------------------------------
function SubagentCard({ args }: { args: ToolCardArgs }) {
  const state = args.state;
  const toolName = args.toolName;
  const isDone = state === "output-available" || state === "output-error" || state === "output-denied";

  return (
    <div className="flex items-center gap-2.5 rounded-lg border px-3.5 py-2 text-sm bg-muted/20 text-muted-foreground mt-1">
      <Bot className="size-4 text-blue-500 shrink-0" />
      <span>
        Delegating to sub-agent: <b>{toolName}</b>
      </span>
      {isDone ? (
        <CheckCircle className="size-3.5 text-green-500 ml-auto shrink-0" />
      ) : (
        <span className="animate-pulse text-xs text-blue-500 ml-auto font-medium shrink-0">
          Active
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Harness tool cards
// ---------------------------------------------------------------------------
function WebSearchCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  return (
    <div className="rounded-lg border p-3.5 bg-muted/10 mt-1 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Search className="size-3.5 text-sky-500" />
        <span>
          Web Search: <b>{args?.query || "Searching…"}</b>
        </span>
      </div>
      {!!result && (
        <div className="text-xs text-foreground/80 pl-5 border-l border-muted-foreground/20 leading-relaxed max-h-32 overflow-y-auto">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  );
}

function BashCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  return (
    <div className="rounded-lg border p-3 bg-neutral-900 text-neutral-100 font-mono text-xs mt-1 space-y-1.5 overflow-hidden">
      <div className="flex items-center gap-2 text-neutral-400 border-b border-neutral-800 pb-1.5">
        <Terminal className="size-3.5" />
        <span className="font-semibold">Terminal</span>
        <code className="text-[10px] bg-neutral-800 px-1.5 py-0.5 rounded text-neutral-300 ml-auto truncate max-w-[60%]">
          {args?.command || "shell"}
        </code>
      </div>
      <pre className="text-green-400 overflow-x-auto whitespace-pre-wrap max-h-48 py-1">
        $ {args?.command || ""}
      </pre>
      {!!result && (
        <pre className="text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-60 border-t border-neutral-800/50 pt-1.5">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ReadFileCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/10 mt-1 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <FileText className="size-3.5 text-violet-500" />
        <span>
          Read File:{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-[11px]">
            {args?.path || ""}
          </code>
        </span>
      </div>
      {!!result && (
        <pre className="text-[11px] font-mono bg-muted/40 p-2 rounded border max-h-40 overflow-auto whitespace-pre">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// Line-level +/− counts for the chip label; same jsdiff engine the DiffViewer uses,
// so the numbers match the modal's header stats.
function diffStats(before: string, after: string): { added: number; removed: number } {
  const { hunks } = structuredPatch("", "", before, after, undefined, undefined, { context: 0 });
  let added = 0;
  let removed = 0;
  for (const hunk of hunks) {
    for (const line of hunk.lines) {
      if (line.startsWith("+")) added++;
      else if (line.startsWith("-")) removed++;
    }
  }
  return { added, removed };
}

const chipClass =
  "inline-flex w-fit max-w-full self-start items-center gap-1.5 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs my-1";

export function WriteFileCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  const input = (args.input ?? {}) as WriteFileInput;
  const out = result as WriteFileOutput | undefined;
  const path = input.path || out?.path || args.path || "";
  const next = input.content ?? "";

  const [reverted, setReverted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const before = out?.before ?? null;
  const created = Boolean(out?.created);
  // Need a baseline to diff/revert. A created file diffs against "" and reverts by delete.
  const hasBaseline = before !== null || created;

  const stats = useMemo(
    () => (out && out.ok !== false && hasBaseline ? diffStats(before ?? "", next) : null),
    [out, hasBaseline, before, next]
  );

  // Write in progress — no result yet.
  if (!out) {
    return (
      <div className={chipClass}>
        <FileText className="size-3.5 shrink-0 text-emerald-500" />
        <span className="text-muted-foreground animate-pulse">
          Editing{" "}
          <code className="text-foreground font-mono">{path || "file…"}</code>
        </span>
      </div>
    );
  }

  // Execution error.
  if (out.ok === false) {
    return (
      <div className={cnChip("border-red-500/40")}>
        <XCircle className="size-3.5 shrink-0 text-red-500" />
        <span className="text-muted-foreground truncate">
          Edit failed: <code className="text-foreground font-mono">{path}</code>
          <span className="text-red-500 ml-1.5">{out.error || "unknown error"}</span>
        </span>
      </div>
    );
  }

  // No baseline snapshot (file was too large) — edit applied, but no diff/revert.
  if (!hasBaseline || !stats) {
    return (
      <div className={chipClass}>
        <FileText className="size-3.5 shrink-0 text-emerald-500" />
        <span className="text-muted-foreground truncate">
          Edited <code className="text-foreground font-mono">{path}</code> · diff unavailable
        </span>
      </div>
    );
  }

  const doRevert = async () => {
    if (!input.projectId || !path) return;
    setBusy(true);
    setError(null);
    try {
      // Guard against clobbering edits made after this write (by the user or a later turn).
      const current = await fetchFileContent(input.projectId, path);
      if (current !== null && next && current !== next) {
        const ok = window.confirm(
          "This file changed since Eve's edit. Revert anyway and overwrite the current content?"
        );
        if (!ok) return;
      }
      const success = created
        ? await postFiles({ projectId: input.projectId, action: "delete", path })
        : await postFiles({ projectId: input.projectId, action: "save", path, content: before ?? "" });
      if (!success) {
        setError("Revert failed.");
        return;
      }
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
      setReverted(true);
    } finally {
      setBusy(false);
    }
  };

  const doReapply = async () => {
    if (!input.projectId || !path) return;
    setBusy(true);
    setError(null);
    try {
      const success = await postFiles({
        projectId: input.projectId,
        action: "save",
        path,
        content: next,
      });
      if (!success) {
        setError("Re-apply failed.");
        return;
      }
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
      setReverted(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog>
      {/* The whole chip is the trigger: [ code changes · main.tex · +11 -9 ] */}
      <DialogTrigger asChild>
        <button
          type="button"
          className={cnChip(
            "hover:bg-muted/60 focus-visible:ring-ring/50 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none"
          )}
        >
          <FileText className="size-3.5 shrink-0 text-emerald-500" />
          <span className="text-muted-foreground shrink-0 font-medium">Code changes</span>
          <code className="text-foreground truncate font-mono">{path}</code>
          <span className="shrink-0 font-mono text-emerald-600 dark:text-emerald-400">
            +{stats.added}
          </span>
          <span className="shrink-0 font-mono text-red-600 dark:text-red-400">
            -{stats.removed}
          </span>
          {created && <span className="shrink-0 text-emerald-500/80">new file</span>}
          {reverted && <span className="shrink-0 text-amber-500/90">reverted</span>}
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{path}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[65vh] overflow-auto">
          <DiffViewer
            oldCode={before ?? ""}
            newCode={next}
            layout="split"
            language="latex"
            oldTitle="Original"
            newTitle={created ? "New file" : "Edited"}
          />
        </div>
        <DialogFooter className="items-center">
          {error && <span className="mr-auto text-xs text-red-500">{error}</span>}
          {reverted ? (
            <Button size="sm" variant="outline" onClick={doReapply} disabled={busy}>
              <RotateCcw className="mr-1.5 size-3.5" />
              Re-apply
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={doRevert} disabled={busy}>
              <Undo2 className="mr-1.5 size-3.5" />
              Revert
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function cnChip(extra: string): string {
  return `${chipClass} ${extra}`;
}

function TodoCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/10 mt-1 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <CheckSquare className="size-3.5 text-amber-500" />
        <span>
          Todo: <b>{args?.action || "update"}</b>
        </span>
      </div>
      {!!result && (
        <pre className="text-xs bg-muted/40 p-2 rounded border max-h-32 overflow-auto font-mono">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ListFilesCard({ result }: { result?: unknown }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/10 mt-1 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Search className="size-3.5 text-violet-500" />
        <span>List Files in Project</span>
      </div>
      {!!result && (
        <pre className="text-[11px] font-mono bg-muted/40 p-2 rounded border max-h-40 overflow-auto whitespace-pre">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registry — Tool UI components using standard makeAssistantToolUI
// ---------------------------------------------------------------------------
export const HitlToolUI = makeAssistantToolUI({
  toolName: "__hitl__",
  render: ({ args }) => <HitlCard args={args} />,
});

export const AskQuestionToolUI = makeAssistantToolUI({
  toolName: "ask_question",
  render: ({ args }) => <HitlCard args={args} />,
});

export const OauthToolUI = makeAssistantToolUI({
  toolName: "__oauth__",
  render: ({ args }) => <OAuthCard args={args} />,
});

export const SubagentToolUI = makeAssistantToolUI({
  toolName: "__subagent__",
  render: ({ args }) => <SubagentCard args={args} />,
});

export const WebSearchToolUI = makeAssistantToolUI({
  toolName: "web_search",
  render: ({ args, result }) => <WebSearchCard args={args} result={result} />,
});

export const BashToolUI = makeAssistantToolUI({
  toolName: "bash",
  render: ({ args, result }) => <BashCard args={args} result={result} />,
});

export const ReadFileToolUI = makeAssistantToolUI({
  toolName: "read_file",
  render: ({ args, result }) => <ReadFileCard args={args} result={result} />,
});

export const ReadFileDashToolUI = makeAssistantToolUI({
  toolName: "read-file",
  render: ({ args, result }) => <ReadFileCard args={args} result={result} />,
});

export const WriteFileToolUI = makeAssistantToolUI({
  toolName: "write_file",
  render: ({ args, result }) => <WriteFileCard args={args} result={result} />,
});

export const WriteFileDashToolUI = makeAssistantToolUI({
  toolName: "write-file",
  render: ({ args, result }) => <WriteFileCard args={args} result={result} />,
});

export const ListFilesToolUI = makeAssistantToolUI({
  toolName: "list-files",
  render: ({ result }) => <ListFilesCard result={result} />,
});

export const ListFilesSnakeToolUI = makeAssistantToolUI({
  toolName: "list_files",
  render: ({ result }) => <ListFilesCard result={result} />,
});

export const TodoToolUI = makeAssistantToolUI({
  toolName: "todo",
  render: ({ args, result }) => <TodoCard args={args} result={result} />,
});


