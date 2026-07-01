"use client";

import React, { useState } from "react";
import {
  ShieldAlert,
  Bot,
  CheckCircle,
  XCircle,
  Search,
  Terminal,
  FileText,
  CheckSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEveAgentCtx } from "@/components/chat/eve-agent-context";
import { makeAssistantToolUI } from "@assistant-ui/react";


// ---------------------------------------------------------------------------
// HITL — Human-in-the-Loop approval + ask_question prompt
// ---------------------------------------------------------------------------
function HitlCard({ args }: { args: any }) {
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
      {args.input && inputRequest.display === "confirmation" && (
        <pre className="text-xs bg-muted/65 p-2 rounded overflow-x-auto max-h-40 font-mono">
          {JSON.stringify(args.input, null, 2)}
        </pre>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {inputRequest.options && inputRequest.options.length > 0 ? (
          inputRequest.options.map((opt: any) => (
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
function OAuthCard({ args }: { args: any }) {
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
function SubagentCard({ args }: { args: any }) {
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
function WebSearchCard({ args, result }: { args: any; result?: any }) {
  return (
    <div className="rounded-lg border p-3.5 bg-muted/10 mt-1 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Search className="size-3.5 text-sky-500" />
        <span>
          Web Search: <b>{args?.query || "Searching…"}</b>
        </span>
      </div>
      {result && (
        <div className="text-xs text-foreground/80 pl-5 border-l border-muted-foreground/20 leading-relaxed max-h-32 overflow-y-auto">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </div>
      )}
    </div>
  );
}

function BashCard({ args, result }: { args: any; result?: any }) {
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
      {result && (
        <pre className="text-neutral-300 overflow-x-auto whitespace-pre-wrap max-h-60 border-t border-neutral-800/50 pt-1.5">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ReadFileCard({ args, result }: { args: any; result?: any }) {
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
      {result && (
        <pre className="text-[11px] font-mono bg-muted/40 p-2 rounded border max-h-40 overflow-auto whitespace-pre">
          {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function WriteFileCard({ args, result }: { args: any; result?: any }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/10 mt-1 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <FileText className="size-3.5 text-emerald-500" />
        <span>
          Write File:{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground text-[11px]">
            {args?.path || ""}
          </code>
        </span>
      </div>
      {result && (
        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium pl-5">
          ✓ Written successfully.
        </div>
      )}
    </div>
  );
}

function TodoCard({ args, result }: { args: any; result?: any }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/10 mt-1 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <CheckSquare className="size-3.5 text-amber-500" />
        <span>
          Todo: <b>{args?.action || "update"}</b>
        </span>
      </div>
      {result && (
        <pre className="text-xs bg-muted/40 p-2 rounded border max-h-32 overflow-auto font-mono">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ListFilesCard({ result }: { result?: any }) {
  return (
    <div className="rounded-lg border p-3 bg-muted/10 mt-1 space-y-1.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
        <Search className="size-3.5 text-violet-500" />
        <span>List Files in Project</span>
      </div>
      {result && (
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


