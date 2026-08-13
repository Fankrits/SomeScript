"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { AssistantRuntimeProvider, useAui } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { EveAgentContext } from "@/components/chat/eve-agent-context";
import { ModelModeContext } from "@/components/chat/model-mode-context";
import { ContextUsageProvider } from "@/components/chat/context-usage";
import { DEFAULT_MODE, isEveMode, type EveMode } from "@/lib/eve-modes";
import { fetchThreadSnapshot, type ThreadSnapshot } from "@/lib/eve-threads-client";
import type { MessageStreamEvent, ClientSessionState } from "eve/client";

type EveThreadSnapshot = ThreadSnapshot<MessageStreamEvent, ClientSessionState>;
import {
  HitlToolUI,
  AskQuestionToolUI,
  OauthToolUI,
  SubagentToolUI,
  WebSearchToolUI,
  BashToolUI,
  ReadFileToolUI,
  ReadFileDashToolUI,
  WriteFileToolUI,
  WriteFileDashToolUI,
  EditFileToolUI,
  ListFilesToolUI,
  ListFilesSnakeToolUI,
  TodoToolUI,
  WebFetchToolUI,
  DeleteFileToolUI,
  MoveFileToolUI,
  CompileProjectToolUI,
  ReadCompileLogToolUI,
} from "@/components/assistant-ui/eve-tool-calls";

/**
 * Full-featured AI chat powered by assistant-ui + Eve Agent Framework.
 *
 * - Streaming markdown with code highlighting
 * - Native collapsible reasoning/thinking blocks
 * - Tool cards: web_search, bash, read_file, write_file, todo, glob, grep…
 * - HITL approval + ask_question prompts (wired to agent.send)
 * - OAuth/connection authorization flow
 * - Subagent delegation status
 * - Image & file attachment composer (drag-drop, paste, picker)
 * - Voice dictation (via browser Speech API)
 * - Stop button, copy
 */
/**
 * Attaches text from elsewhere in the app (e.g. terminal output) to the
 * composer as a file, so it shows up as a chip instead of filling the input.
 */
function ComposerInbox() {
  const aui = useAui();

  React.useEffect(() => {
    const onInsert = (e: Event) => {
      const { name, text } = (e as CustomEvent<{ name: string; text: string }>).detail;
      if (!text) return;
      void aui.composer.addAttachment(new File([text], name, { type: "text/plain" }));
    };
    window.addEventListener("somescript:attach-to-chat", onInsert);
    return () => window.removeEventListener("somescript:attach-to-chat", onInsert);
  }, [aui]);

  return null;
}

/**
 * A failed send clears the composer and leaves no message behind, so without
 * this the whole turn just disappears with nothing to explain it. When the
 * failure is a recoverable stall, `onContinue` offers a one-click way to
 * send "continue" instead of leaving the user to figure out what to do.
 */
function ChatError({
  message,
  canContinue,
  onContinue,
  onDismiss,
}: {
  message: string;
  canContinue: boolean;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="alert"
      className="mx-2 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      <span className="min-w-0 flex-1 wrap-break-word">{message}</span>
      {canContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="shrink-0 rounded-md border border-destructive/40 bg-background px-2 py-0.5 text-xs font-medium hover:bg-destructive/10"
        >
          Continue
        </button>
      )}
      <CopyDiagnostics />
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded px-1 text-xs underline underline-offset-2 hover:opacity-70"
      >
        Dismiss
      </button>
    </div>
  );
}

/**
 * Hands the user the ring buffer from lib/eve-diagnostics.ts as pasteable JSON.
 * Turns "the AI stopped responding" — a report with nothing attached to it —
 * into the event trail that led up to it, without asking anyone to open devtools.
 */
function CopyDiagnostics() {
  const [copied, setCopied] = React.useState(false);
  // Void-returning so it can be passed straight to onClick without allocating
  // a new arrow on every render of the banner.
  const onCopy = React.useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(
          JSON.stringify(window.eveDiagnostics?.() ?? [], null, 2),
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Clipboard is permission-gated and can simply refuse. The label just
        // doesn't change; nothing here is worth breaking an error banner over.
      }
    })();
  }, []);
  return (
    <button
      type="button"
      onClick={onCopy}
      className="shrink-0 rounded px-1 text-xs underline underline-offset-2 hover:opacity-70"
    >
      {copied ? "Copied" : "Copy diagnostics"}
    </button>
  );
}

const MODE_STORAGE_KEY = "eve-model-mode";

/**
 * assistant-ui's ExternalStoreRuntime holds its composer-client snapshot
 * (including `attachmentAccept`, which drives the file picker's native
 * filter) on the stable runtime instance created by `useExternalStoreRuntime`,
 * not on any consuming component — so remounting a leaf like the attachment
 * button does not refresh it after a live adapter swap. Keying this whole
 * inner subtree by `mode` forces `useEveRuntime` to build a brand new runtime
 * (and re-run `useEveAgent`) on every switch, which is the one path proven to
 * pick up the new adapter correctly. `useEveAgent` rehydrates from the same
 * localStorage snapshot the existing autosave effect already writes on every
 * turn, so the visible conversation is unaffected; only in-flight composer
 * state (typed draft, staged attachments) resets, same as a page reload.
 */
function EveThreadInner({
  threadId,
  projectId,
  mode,
  openFile,
  initialData,
  onTitleChange,
}: {
  threadId: string;
  projectId: string;
  mode: EveMode;
  openFile?: string | null;
  initialData: EveThreadSnapshot | null;
  onTitleChange: (title: string) => void;
}) {
  const { runtime, agent, error, contextUsage, canContinue, continueTurn, dismissError } =
    useEveRuntime(threadId, projectId, mode, openFile, initialData, onTitleChange);

  return (
    <EveAgentContext.Provider value={agent}>
      <ContextUsageProvider value={contextUsage}>
        <AssistantRuntimeProvider runtime={runtime}>
          {/* Natively register all Eve-specific custom tool call UIs */}
          <HitlToolUI />
          <AskQuestionToolUI />
          <OauthToolUI />
          <SubagentToolUI />
          <WebSearchToolUI />
          <BashToolUI />
          <ReadFileToolUI />
          <ReadFileDashToolUI />
          <WriteFileToolUI />
          <WriteFileDashToolUI />
          <EditFileToolUI />
          <ListFilesToolUI />
          <ListFilesSnakeToolUI />
          <TodoToolUI />
          <WebFetchToolUI />
          <DeleteFileToolUI />
          <MoveFileToolUI />
          <CompileProjectToolUI />
          <ReadCompileLogToolUI />
          <ComposerInbox />

          <div className="h-full flex flex-col bg-background">
            {/* Thread is h-full, so it needs its own flex box to shrink for the
              error banner instead of pushing it out of view. */}
            <div className="min-h-0 flex-1">
              <Thread />
            </div>
            {error && (
              <ChatError
                message={error}
                canContinue={canContinue}
                onContinue={continueTurn}
                onDismiss={dismissError}
              />
            )}
          </div>
        </AssistantRuntimeProvider>
      </ContextUsageProvider>
    </EveAgentContext.Provider>
  );
}

export function EveThread({
  threadId,
  projectId,
  openFile,
  onTitleChange,
}: {
  threadId: string;
  projectId: string;
  /** Project-relative path of the open editor tab, so Eve can act on "this file". */
  openFile?: string | null;
  onTitleChange: (title: string) => void;
}) {
  // Last-picked mode is remembered globally (one key), defaulting to Lite.
  const [mode, setMode] = React.useState<EveMode>(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    return isEveMode(saved) ? saved : DEFAULT_MODE;
  });
  React.useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  // Chat history now lives server-side (lib/eve-threads-storage.ts), not in
  // localStorage — useEveAgent (inside useEveRuntime) only reads its
  // initialEvents/initialSession once, at mount, so the fetch has to resolve
  // *before* EveThreadInner mounts rather than inside the hook itself.
  const [snapshot, setSnapshot] = React.useState<EveThreadSnapshot | null | "loading">("loading");
  React.useEffect(() => {
    let cancelled = false;
    setSnapshot("loading");
    fetchThreadSnapshot<MessageStreamEvent, ClientSessionState>(projectId, threadId)
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, threadId]);

  if (snapshot === "loading") {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Loading conversation...</span>
      </div>
    );
  }

  return (
    <ModelModeContext.Provider value={{ mode, setMode }}>
      <EveThreadInner
        key={mode}
        threadId={threadId}
        projectId={projectId}
        mode={mode}
        openFile={openFile}
        initialData={snapshot}
        onTitleChange={onTitleChange}
      />
    </ModelModeContext.Provider>
  );
}
