"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  ArrowUp,
  FileText,
  Info,
  Loader2,
  Paperclip,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type { MessageStreamEvent, ClientSessionState } from "eve/client";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Button } from "@/components/ui/button";
import { ModelModeSelect } from "./model-mode-select";
import { ContextIndicator, ContextUsageProvider } from "./context-usage";
import { EveAgentContext } from "./eve-agent-context";
import { ToolCard, TodoList } from "./tool-cards";
import { latestTodos } from "./reduce";
import type { EveMode } from "@/lib/eve-modes";
import type { ThreadSnapshot } from "@/lib/eve-threads-client";
import type { AssistantMessage, Attachment, ChatMessage, UserMessage } from "./types";
import { useWebChat } from "./use-web-chat";

const MAX_ATTACHMENT_CHARS = 200_000;

const SUGGESTIONS = [
  "Explain what this document does",
  "Fix the errors when I compile",
  "Tighten the writing in the open file",
  "Add a bibliography with a few BibTeX entries",
];

async function readFileAttachment(file: File, isLite: boolean): Promise<Attachment | null> {
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";

  if (isLite && (isImage || isPdf)) {
    toast.error("Lite mode only supports text attachments. Switch to Pro or Expert.");
    return null;
  }

  if (isImage || isPdf) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          name: file.name,
          text: "",
          type: isImage ? "image" : "file",
          url: reader.result as string,
          mediaType: file.type || (isPdf ? "application/pdf" : "image/*"),
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        name: file.name,
        text: (reader.result as string).slice(0, MAX_ATTACHMENT_CHARS),
        type: "text",
      });
    };
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

export function ChatThread(props: {
  threadId: string;
  projectId: string;
  mode: EveMode;
  openFile?: string | null;
  initialData: ThreadSnapshot<MessageStreamEvent, ClientSessionState> | null;
  onTitleChange: (title: string) => void;
}) {
  const chat = useWebChat(props);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Text sent from elsewhere in the editor ("Send to chat" on terminal, code selection)
  useEffect(() => {
    const onAttach = (e: Event) => {
      const { name, text } = (e as CustomEvent<{ name: string; text: string }>).detail ?? {};
      if (!text) return;
      setAttachments((prev) =>
        prev.some((a) => a.name === name && a.text === text)
          ? prev
          : [...prev, { name, text: text.slice(0, MAX_ATTACHMENT_CHARS), type: "text" }],
      );
    };
    window.addEventListener("somescript:attach-to-chat", onAttach);
    return () => window.removeEventListener("somescript:attach-to-chat", onAttach);
  }, []);

  const send = useCallback(
    (text: string) => {
      const files = attachments;
      setAttachments([]);
      void chat.send(text, files);
    },
    [attachments, chat],
  );

  const todoOwner = useMemo(() => latestTodoOwner(chat.messages), [chat.messages]);

  return (
    <EveAgentContext.Provider value={chat.agent}>
      <ContextUsageProvider value={chat.contextUsage}>
        <div
          className="@container flex h-full min-h-0 min-w-0 w-full flex-1 flex-col bg-background"
          data-testid="chat-thread"
        >
          <Conversation className="min-h-0 min-w-0 w-full flex-1">
            <ConversationContent className="gap-5 p-3 min-w-0 w-full">
              {chat.messages.length === 0 ? (
                <Welcome onPick={send} />
              ) : (
                chat.messages.map((m) =>
                  m.role === "user" ? (
                    <UserBubble key={m.id} message={m} />
                  ) : (
                    <AssistantBubble
                      key={m.id}
                      message={m}
                      projectId={props.projectId}
                      todoOwner={todoOwner}
                      onRetry={m.error ? () => void chat.retry() : undefined}
                    />
                  ),
                )
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          {chat.error && (
            <ErrorBanner
              message={chat.error}
              canContinue={chat.canContinue}
              onContinue={chat.continueTurn}
              onDismiss={chat.dismissError}
              onRetry={() => void chat.retry()}
            />
          )}

          <Composer
            disabled={false}
            running={chat.running}
            mode={props.mode}
            attachments={attachments}
            onAddAttachments={(items) => setAttachments((prev) => [...prev, ...items])}
            onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
            onSend={send}
            onStop={chat.stop}
          />
        </div>
      </ContextUsageProvider>
    </EveAgentContext.Provider>
  );
}

function latestTodoOwner(messages: ChatMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role === "assistant" && latestTodos(m.parts)) return m.id;
  }
  return null;
}

function Welcome({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div
      className="flex flex-col items-center gap-4 px-2 pt-6 text-center"
      data-testid="chat-welcome"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Sparkles className="size-5 text-muted-foreground" />
      </div>
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">Ask about your document</h3>
        <p className="text-xs text-muted-foreground">
          I can read and edit your files, and compile to check my work.
        </p>
      </div>
      <div className="grid w-full gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg border border-border/60 px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBubble({ message }: { message: UserMessage }) {
  const images = message.attachments?.filter((a) => a.type === "image" && a.url) ?? [];
  const nonImages = message.attachments?.filter((a) => a.type !== "image" || !a.url) ?? [];

  return (
    <div
      className="ml-auto flex max-w-[92%] flex-col items-end gap-1.5 min-w-0"
      data-testid="user-message"
    >
      {images.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5 max-w-full">
          {images.map((img, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border/70 bg-muted/30 shadow-xs max-w-full"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.name}
                className="max-h-48 max-w-full object-contain rounded-md"
              />
            </div>
          ))}
        </div>
      )}
      {nonImages.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1.5 max-w-full">
          {nonImages.map((a, i) => (
            <div
              key={i}
              className="flex max-w-full items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-1 text-[11px] text-muted-foreground"
            >
              <FileText className="size-3.5 shrink-0" />
              <span className="truncate max-w-[180px]">{a.name}</span>
            </div>
          ))}
        </div>
      )}
      {message.text && (
        <div className="rounded-lg bg-secondary px-3.5 py-2.5 text-sm break-words whitespace-pre-wrap text-foreground max-w-full">
          {message.text}
        </div>
      )}
    </div>
  );
}

function AssistantBubble(props: {
  message: AssistantMessage;
  projectId: string;
  todoOwner: string | null;
  onRetry?: () => void;
}) {
  const { message: m } = props;
  const last = m.parts.length - 1;
  const latestTodoId = useMemo(() => {
    for (let i = m.parts.length - 1; i >= 0; i--) {
      const p = m.parts[i];
      if (p.type === "tool" && (p.name === "todo_write" || p.name === "todo")) return p.id;
    }
    return null;
  }, [m.parts]);

  const waiting =
    m.running &&
    (m.parts.length === 0 || (m.parts[last].type === "tool" && m.parts[last].status !== "running"));

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-2 text-sm overflow-hidden" data-testid="assistant-message">
      {m.parts.map((p, i) => {
        switch (p.type) {
          case "text":
            return p.text.trim() ? (
              <div key={i} className="min-w-0 max-w-full break-words overflow-hidden" data-testid="assistant-text">
                <MessageResponse isAnimating={Boolean(m.running) && i === last}>
                  {p.text}
                </MessageResponse>
              </div>
            ) : null;
          case "reasoning":
            return (
              <Reasoning
                key={i}
                isStreaming={Boolean(m.running) && i === last}
                defaultOpen={false}
                className="mb-0 max-w-full"
              >
                <ReasoningTrigger />
                <ReasoningContent className="break-words">{p.text}</ReasoningContent>
              </Reasoning>
            );
          case "notice":
            return (
              <p key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground break-words">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>{p.text}</span>
              </p>
            );
          case "tool":
            if (p.name === "todo_write" || p.name === "todo") {
              if (p.id !== latestTodoId || m.id !== props.todoOwner) return null;
              const todos = latestTodos(m.parts);
              return todos ? <TodoList key={p.id} todos={todos} /> : null;
            }
            return <ToolCard key={p.id} part={p} projectId={props.projectId} />;
        }
      })}
      {waiting && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="assistant-working"
        >
          <Loader2 className="size-3.5 animate-spin text-primary" /> Working…
        </div>
      )}
      {m.error && (
        <div
          role="alert"
          data-testid="assistant-error"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-xs text-destructive"
        >
          <span className="min-w-0 flex-1 break-words">{m.error}</span>
          {props.onRetry && (
            <Button size="xs" variant="outline" onClick={props.onRetry}>
              <RotateCcw className="size-3" /> Retry
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ErrorBanner(props: {
  message: string;
  canContinue: boolean;
  onContinue: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(() => {
    void (async () => {
      try {
        await navigator.clipboard.writeText(
          JSON.stringify((window as unknown as { eveDiagnostics?: () => unknown }).eveDiagnostics?.() ?? [], null, 2),
        );
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // ignore
      }
    })();
  }, []);

  return (
    <div
      role="alert"
      data-testid="chat-error"
      className="mx-2 mb-2 flex flex-col gap-1.5 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 flex-1 break-words leading-relaxed">{props.message}</span>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={props.onDismiss}
          className="shrink-0 rounded p-0.5 hover:bg-destructive/10"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {props.canContinue && (
          <Button size="xs" variant="outline" className="h-6 px-2 text-[11px]" onClick={props.onContinue}>
            Continue
          </Button>
        )}
        <Button size="xs" variant="outline" className="h-6 px-2 text-[11px]" onClick={props.onRetry}>
          <RotateCcw className="size-3 mr-1" /> Retry
        </Button>
        <button
          type="button"
          onClick={onCopy}
          className="rounded px-1 text-[11px] underline underline-offset-2 hover:opacity-70 text-muted-foreground"
        >
          {copied ? "Copied" : "Copy diagnostics"}
        </button>
      </div>
    </div>
  );
}

function Composer(props: {
  disabled: boolean;
  running: boolean;
  mode: EveMode;
  attachments: Attachment[];
  onAddAttachments: (items: Attachment[]) => void;
  onRemoveAttachment: (index: number) => void;
  onSend: (text: string) => void;
  onStop: () => void;
}) {
  const [text, setText] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend =
    !props.disabled && !props.running && (text.trim().length > 0 || props.attachments.length > 0);

  const syncHeight = useCallback(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    const clamped = scrollH > 0 ? Math.min(Math.max(scrollH, 40), 176) : 40;
    el.style.height = `${clamped}px`;
  }, []);

  useEffect(() => {
    syncHeight();
  }, [text, syncHeight]);

  useEffect(() => {
    const el = area.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncHeight();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncHeight]);

  const submit = () => {
    if (!canSend) return;
    props.onSend(text);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const isLite = props.mode === "lite";
    const items: Attachment[] = [];
    for (let i = 0; i < fileList.length; i++) {
      const att = await readFileAttachment(fileList[i], isLite);
      if (att) items.push(att);
    }
    if (items.length > 0) {
      props.onAddAttachments(items);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleFiles(e.target.files);
    e.target.value = "";
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (e.clipboardData.files.length > 0) {
      void handleFiles(e.clipboardData.files);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    void handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const acceptMimes =
    props.mode === "lite"
      ? ".txt,.md,.tex,.bib,.json,.csv,.py,.js,.ts,text/*"
      : ".txt,.md,.tex,.bib,.json,.csv,.py,.js,.ts,text/*,image/*,application/pdf";

  return (
    <div className="shrink-0 border-t border-border/60 p-2 min-w-0 w-full">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptMimes}
        className="hidden"
        onChange={onFileInputChange}
      />
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`w-full min-w-0 rounded-xl border border-border bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring/30 transition-colors ${
          isDragging ? "border-primary bg-primary/5" : ""
        }`}
      >
        {props.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2 pt-2" data-testid="attachments">
            {props.attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/40 py-0.5 pr-0.5 pl-1.5 text-[11px]"
              >
                {a.type === "image" && a.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} className="size-3.5 rounded object-cover" />
                ) : (
                  <FileText className="size-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate max-w-[150px]">{a.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${a.name}`}
                  onClick={() => props.onRemoveAttachment(i)}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={area}
          value={text}
          rows={1}
          disabled={props.disabled}
          data-testid="chat-input"
          aria-label="Message the assistant"
          placeholder="Ask about your document…"
          onFocus={syncHeight}
          onPaste={onPaste}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="block min-h-[40px] max-h-44 w-full min-w-0 resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-2 min-w-0">
          <Button
            size="icon-sm"
            variant="ghost"
            type="button"
            aria-label="Attach file"
            onClick={() => fileInputRef.current?.click()}
            className="text-muted-foreground hover:text-foreground shrink-0"
          >
            <Paperclip className="size-4" />
          </Button>

          <ModelModeSelect disabled={props.running} />
          <ContextIndicator />

          <span className="ml-auto" />
          {props.running ? (
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Stop"
              data-testid="chat-stop"
              onClick={props.onStop}
              className="shrink-0"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              aria-label="Send"
              data-testid="chat-send"
              disabled={!canSend}
              onClick={submit}
              className="shrink-0"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
