"use client";

import React, { useMemo, useRef, useState } from "react";
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
  Trash2,
  FolderInput,
  Globe,
} from "lucide-react";
import { structuredPatch } from "diff";
import Ansi from "ansi-to-react";
import { Button } from "@/components/ui/button";
import { useEveAgentCtx } from "@/components/chat/eve-agent-context";
import { makeAssistantToolUI, type ToolCallMessagePartStatus } from "@assistant-ui/react";
import { EveToolRow } from "@/components/assistant-ui/tool-fallback";
import { DiffViewer } from "@/components/diff-viewer";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
      `/api/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(path)}`,
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

/** Props every ported tool card receives from `makeAssistantToolUI`'s render. */
type EveCardProps = {
  args: ToolCardArgs;
  result?: unknown;
  status?: ToolCallMessagePartStatus;
};

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
    void agent.respond([{ requestId: inputRequest.requestId, optionId }]);
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
              variant={
                opt.style === "primary"
                  ? "default"
                  : opt.style === "danger"
                    ? "destructive"
                    : "outline"
              }
              onClick={() => handleAnswer(opt.id)}
              disabled={submitted}
            >
              {opt.label}
            </Button>
          ))
        ) : (
          // Default approve / reject buttons for bare tool approvals. Mirrors
          // the native ToolFallbackApproval bar (default + outline) so the two
          // approval surfaces are indistinguishable.
          <>
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
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
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
function SubagentCard({ args, status }: EveCardProps) {
  // A one-line status row: no body, so it renders without a disclosure the
  // user could click into and find empty. The shared shimmer carries "active".
  return (
    <EveToolRow
      icon={Bot}
      iconClassName="text-blue-500"
      label={<>Sub-agent: {args?.toolName || "delegating…"}</>}
      status={status}
    />
  );
}

// ---------------------------------------------------------------------------
// Harness tool cards
// ---------------------------------------------------------------------------
/** Shared output block, mirroring the native `ToolFallbackResult` look. */
function ToolOutput({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <pre
      className={`bg-muted/50 text-foreground/90 max-h-60 overflow-auto rounded-md p-2.5 font-mono text-xs whitespace-pre-wrap ${className ?? ""}`}
    >
      {children}
    </pre>
  );
}

const asText = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));

function WebSearchCard({ args, result, status }: EveCardProps) {
  return (
    <EveToolRow
      icon={Search}
      iconClassName="text-sky-500"
      label={<>Web search: {args?.query || "…"}</>}
      status={status}
    >
      {!!result && <ToolOutput>{asText(result)}</ToolOutput>}
    </EveToolRow>
  );
}

function BashCard({ args, result, status }: EveCardProps) {
  return (
    <EveToolRow icon={Terminal} label={<>Terminal: {args?.command || "shell"}</>} status={status}>
      {/* Terminal chrome matches components/ai-elements/terminal.tsx (the
          editor's own terminal panel) so there's one terminal look in the app. */}
      <div className="overflow-hidden rounded-md bg-zinc-950 p-2.5 font-mono text-xs text-zinc-100">
        <pre className="max-h-48 overflow-x-auto whitespace-pre-wrap text-green-400">
          $ {args?.command || ""}
        </pre>
        {!!result && (
          <pre className="mt-1.5 max-h-60 overflow-x-auto border-t border-zinc-800/50 pt-1.5 whitespace-pre-wrap text-zinc-300">
            {asText(result)}
          </pre>
        )}
      </div>
    </EveToolRow>
  );
}

// compile-project and read-compile-log return the same shape, so one card covers
// both. Deliberately a compact receipt: the user's own terminal panel already has
// the full log with clickable "Jump to line" cards, because the page mirrors these
// results into it (see the somescript:compiled listener in app/page.tsx).
type CompileOutput = {
  ok?: boolean;
  path?: string;
  pdfPath?: string | null;
  errors?: Array<{ file: string; line: number; message: string }>;
  log?: string;
  error?: string;
  ageSeconds?: number;
};

function CompileCard({ args, result, status, kind }: EveCardProps & { kind: "compile" | "log" }) {
  const out = (result ?? undefined) as CompileOutput | undefined;
  const path = (args?.input as { path?: string } | undefined)?.path || out?.path || "";
  const errorCount = out?.errors?.length ?? 0;

  let label: React.ReactNode;
  if (!out) {
    label = kind === "compile" ? <>Compiling {path || "project"}…</> : <>Reading compile log…</>;
  } else if (out.error) {
    label = kind === "compile" ? <>Compile not run</> : <>No compile log</>;
  } else {
    const age =
      typeof out.ageSeconds === "number" && out.ageSeconds > 0 ? ` (${out.ageSeconds}s ago)` : "";
    const verb = kind === "compile" ? (out.ok ? "Compiled" : "Compile failed:") : "Compile log:";
    label = (
      <>
        {verb} {out.path || path}
        {age}
        {errorCount > 0 && ` — ${errorCount} error${errorCount === 1 ? "" : "s"}`}
      </>
    );
  }

  return (
    <EveToolRow
      icon={Terminal}
      iconClassName={out && !out.error ? (out.ok ? "text-emerald-500" : "text-red-500") : undefined}
      label={label}
      status={status}
    >
      {out?.error ? (
        <ToolOutput>{out.error}</ToolOutput>
      ) : out?.log ? (
        // Same chrome and same ANSI rendering as the editor's terminal panel
        // (components/ai-elements/terminal.tsx), so the log reads identically
        // whether the user compiled or Eve did.
        <div className="overflow-hidden rounded-md bg-zinc-950 p-2.5 font-mono text-xs text-zinc-100">
          <pre className="max-h-60 overflow-x-auto whitespace-pre-wrap">
            <Ansi>{out.log}</Ansi>
          </pre>
        </div>
      ) : null}
    </EveToolRow>
  );
}

function ReadFileCard({ args, result, status }: EveCardProps) {
  return (
    <EveToolRow
      icon={FileText}
      iconClassName="text-violet-500"
      label={<>Read file: {args?.path || ""}</>}
      status={status}
    >
      {!!result && <ToolOutput className="max-h-40 whitespace-pre">{asText(result)}</ToolOutput>}
    </EveToolRow>
  );
}

type WebFetchInput = { url?: string };
type WebFetchOutput = { content?: string; url?: string; truncated?: boolean };

function WebFetchCard({ args, result, status }: EveCardProps) {
  const input = (args.input ?? {}) as WebFetchInput;
  const out = result as WebFetchOutput | undefined;
  const url = out?.url || input.url || "";
  return (
    <EveToolRow
      icon={Globe}
      iconClassName="text-sky-500"
      label={<>Fetch: {url || "…"}</>}
      status={status}
    >
      {!!out?.content && (
        <ToolOutput className="max-h-48 whitespace-pre-wrap">
          {out.truncated ? `${out.content}\n\n[truncated]` : out.content}
        </ToolOutput>
      )}
    </EveToolRow>
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
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const confirmResolveRef = useRef<((ok: boolean) => void) | null>(null);

  const askOverwriteConfirm = () =>
    new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      setConfirmOverwrite(true);
    });

  const resolveOverwriteConfirm = (ok: boolean) => {
    setConfirmOverwrite(false);
    confirmResolveRef.current?.(ok);
    confirmResolveRef.current = null;
  };

  const before = out?.before ?? null;
  const created = Boolean(out?.created);
  // Need a baseline to diff/revert. A created file diffs against "" and reverts by delete.
  const hasBaseline = before !== null || created;

  const stats = useMemo(
    () => (out && out.ok !== false && hasBaseline ? diffStats(before ?? "", next) : null),
    [out, hasBaseline, before, next],
  );

  // Write in progress — no result yet.
  if (!out) {
    return (
      <div className={chipClass}>
        <FileText className="size-3.5 shrink-0 text-emerald-500" />
        <span className="text-muted-foreground animate-pulse motion-reduce:animate-none">
          Editing <code className="text-foreground font-mono">{path || "file…"}</code>
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
        const ok = await askOverwriteConfirm();
        if (!ok) return;
      }
      const success = created
        ? await postFiles({ projectId: input.projectId, action: "delete", path })
        : await postFiles({
            projectId: input.projectId,
            action: "save",
            path,
            content: before ?? "",
          });
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
      {/* The whole chip is the trigger: [ main.tex · +11 -9 ] */}
      <DialogTrigger asChild>
        <button
          type="button"
          className={cnChip(
            "hover:bg-muted/60 focus-visible:ring-ring/50 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:outline-none",
          )}
        >
          <FileText className="size-3.5 shrink-0 text-emerald-500" />
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

      <AlertDialog
        open={confirmOverwrite}
        onOpenChange={(open) => !open && resolveOverwriteConfirm(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>File changed since last edit</AlertDialogTitle>
            <AlertDialogDescription>
              Revert anyway and overwrite the current content?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveOverwriteConfirm(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveOverwriteConfirm(true)}>
              Revert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}

function cnChip(extra: string): string {
  return `${chipClass} ${extra}`;
}

type DeleteFileInput = { projectId?: string; path?: string };
type DeleteFileOutput = {
  ok?: boolean;
  path?: string;
  before?: string | null;
  existed?: boolean;
  error?: string;
};

function DeleteFileCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  const input = (args.input ?? {}) as DeleteFileInput;
  const out = result as DeleteFileOutput | undefined;
  const path = input.path || out?.path || args.path || "";

  const [reverted, setReverted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!out) {
    return (
      <div className={chipClass}>
        <Trash2 className="size-3.5 shrink-0 text-red-500" />
        <span className="text-muted-foreground animate-pulse motion-reduce:animate-none">
          Deleting <code className="text-foreground font-mono">{path || "file…"}</code>
        </span>
      </div>
    );
  }

  if (out.ok === false) {
    return (
      <div className={cnChip("border-red-500/40")}>
        <XCircle className="size-3.5 shrink-0 text-red-500" />
        <span className="text-muted-foreground truncate">
          Delete failed: <code className="text-foreground font-mono">{path}</code>
          <span className="text-red-500 ml-1.5">{out.error || "unknown error"}</span>
        </span>
      </div>
    );
  }

  const before = out.before ?? null;
  const canRestore = before !== null;

  const doRevert = async () => {
    if (!input.projectId || !path || before === null) return;
    setBusy(true);
    setError(null);
    try {
      const success = await postFiles({
        projectId: input.projectId,
        action: "save",
        path,
        content: before,
      });
      if (!success) {
        setError("Restore failed.");
        return;
      }
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
      setReverted(true);
    } finally {
      setBusy(false);
    }
  };

  const doReDelete = async () => {
    if (!input.projectId || !path) return;
    setBusy(true);
    setError(null);
    try {
      const success = await postFiles({ projectId: input.projectId, action: "delete", path });
      if (!success) {
        setError("Re-delete failed.");
        return;
      }
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
      setReverted(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cnChip("border-red-500/30")}>
      <Trash2 className="size-3.5 shrink-0 text-red-500" />
      <code className="text-foreground truncate font-mono">{path}</code>
      <span className="shrink-0 text-muted-foreground">
        {out.existed === false ? "did not exist" : reverted ? "restored" : "deleted"}
      </span>
      {error && <span className="shrink-0 text-xs text-red-500">{error}</span>}
      {out.existed !== false &&
        (reverted ? (
          <Button size="sm" variant="outline" onClick={doReDelete} disabled={busy}>
            <RotateCcw className="mr-1.5 size-3.5" />
            Re-delete
          </Button>
        ) : canRestore ? (
          <Button size="sm" variant="outline" onClick={doRevert} disabled={busy}>
            <Undo2 className="mr-1.5 size-3.5" />
            Restore
          </Button>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">(too large to restore)</span>
        ))}
    </div>
  );
}

type MoveFileInput = { projectId?: string; oldPath?: string; newPath?: string };
type MoveFileOutput = { ok?: boolean; oldPath?: string; newPath?: string; error?: string };

function MoveFileCard({ args, result }: { args: ToolCardArgs; result?: unknown }) {
  const input = (args.input ?? {}) as MoveFileInput;
  const out = result as MoveFileOutput | undefined;
  const oldPath = input.oldPath || out?.oldPath || "";
  const newPath = input.newPath || out?.newPath || "";

  const [reverted, setReverted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!out) {
    return (
      <div className={chipClass}>
        <FolderInput className="size-3.5 shrink-0 text-amber-500" />
        <span className="text-muted-foreground animate-pulse motion-reduce:animate-none">
          Moving <code className="text-foreground font-mono">{oldPath || "file…"}</code>
        </span>
      </div>
    );
  }

  if (out.ok === false) {
    return (
      <div className={cnChip("border-red-500/40")}>
        <XCircle className="size-3.5 shrink-0 text-red-500" />
        <span className="text-muted-foreground truncate">
          Move failed: <code className="text-foreground font-mono">{oldPath}</code> →{" "}
          <code className="text-foreground font-mono">{newPath}</code>
          <span className="text-red-500 ml-1.5">{out.error || "unknown error"}</span>
        </span>
      </div>
    );
  }

  // Toggling swaps which path is "current" vs "previous" so one button
  // handles both directions: move back, then move forward again.
  const current = reverted ? oldPath : newPath;
  const previous = reverted ? newPath : oldPath;

  const doToggle = async () => {
    if (!input.projectId) return;
    setBusy(true);
    setError(null);
    try {
      const success = await postFiles({
        projectId: input.projectId,
        action: "move",
        oldPath: current,
        newPath: previous,
      });
      if (!success) {
        setError(reverted ? "Re-apply failed." : "Revert failed.");
        return;
      }
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
      setReverted(!reverted);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cnChip("border-amber-500/30")}>
      <FolderInput className="size-3.5 shrink-0 text-amber-500" />
      <code className="text-foreground truncate font-mono">{oldPath}</code>
      <span className="shrink-0 text-muted-foreground">→</span>
      <code className="text-foreground truncate font-mono">{newPath}</code>
      {reverted && <span className="shrink-0 text-amber-500/90">reverted</span>}
      {error && <span className="shrink-0 text-xs text-red-500">{error}</span>}
      <Button size="sm" variant="outline" onClick={doToggle} disabled={busy}>
        {reverted ? (
          <>
            <RotateCcw className="mr-1.5 size-3.5" />
            Re-apply
          </>
        ) : (
          <>
            <Undo2 className="mr-1.5 size-3.5" />
            Revert
          </>
        )}
      </Button>
    </div>
  );
}

function TodoCard({ args, result, status }: EveCardProps) {
  return (
    <EveToolRow
      icon={CheckSquare}
      iconClassName="text-amber-500"
      label={<>Todo: {args?.action || "update"}</>}
      status={status}
    >
      {!!result && <ToolOutput className="max-h-32">{JSON.stringify(result, null, 2)}</ToolOutput>}
    </EveToolRow>
  );
}

function ListFilesCard({ result, status }: EveCardProps) {
  return (
    <EveToolRow icon={Search} iconClassName="text-violet-500" label="List files" status={status}>
      {!!result && <ToolOutput className="max-h-40 whitespace-pre">{asText(result)}</ToolOutput>}
    </EveToolRow>
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
  render: ({ args, status }) => <SubagentCard args={args} status={status} />,
});

export const WebSearchToolUI = makeAssistantToolUI({
  toolName: "web_search",
  render: ({ args, result, status }) => (
    <WebSearchCard args={args} result={result} status={status} />
  ),
});

export const BashToolUI = makeAssistantToolUI({
  toolName: "bash",
  render: ({ args, result, status }) => <BashCard args={args} result={result} status={status} />,
});

export const ReadFileToolUI = makeAssistantToolUI({
  toolName: "read_file",
  render: ({ args, result, status }) => (
    <ReadFileCard args={args} result={result} status={status} />
  ),
});

export const ReadFileDashToolUI = makeAssistantToolUI({
  toolName: "read-file",
  render: ({ args, result, status }) => (
    <ReadFileCard args={args} result={result} status={status} />
  ),
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
  render: ({ args, result, status }) => (
    <ListFilesCard args={args} result={result} status={status} />
  ),
});

export const ListFilesSnakeToolUI = makeAssistantToolUI({
  toolName: "list_files",
  render: ({ args, result, status }) => (
    <ListFilesCard args={args} result={result} status={status} />
  ),
});

export const TodoToolUI = makeAssistantToolUI({
  toolName: "todo",
  render: ({ args, result, status }) => <TodoCard args={args} result={result} status={status} />,
});

export const WebFetchToolUI = makeAssistantToolUI({
  toolName: "web_fetch",
  render: ({ args, result, status }) => (
    <WebFetchCard args={args} result={result} status={status} />
  ),
});

export const DeleteFileToolUI = makeAssistantToolUI({
  toolName: "delete-file",
  render: ({ args, result }) => <DeleteFileCard args={args} result={result} />,
});

export const MoveFileToolUI = makeAssistantToolUI({
  toolName: "move-file",
  render: ({ args, result }) => <MoveFileCard args={args} result={result} />,
});

// toolName must equal the filename under agent/tools/ — that's where eve derives
// the model-facing name from.
export const CompileProjectToolUI = makeAssistantToolUI({
  toolName: "compile-project",
  render: ({ args, result, status }) => (
    <CompileCard args={args} result={result} status={status} kind="compile" />
  ),
});

export const ReadCompileLogToolUI = makeAssistantToolUI({
  toolName: "read-compile-log",
  render: ({ args, result, status }) => (
    <CompileCard args={args} result={result} status={status} kind="log" />
  ),
});
