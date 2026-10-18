import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  FileText,
  Info,
  KeyRound,
  Loader2,
  RotateCcw,
  Settings,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { settingsUrl, type AiSettings } from "./api";
import { latestTodos } from "./reduce";
import { ToolCard, TodoList } from "./tool-cards";
import type { AssistantMessage, Attachment, ChatMessage, UserMessage } from "./types";
import { useChat } from "./use-chat";
import { activeChoice, useAiSettings } from "./use-ai-settings";

const openSettings = () => window.location.assign(settingsUrl("ai"));
/** Pasted-in code can be huge; the model sees at most this much of one attachment. */
const MAX_ATTACHMENT_CHARS = 200_000;

const SUGGESTIONS = [
  "Explain what this document does",
  "Fix the errors when I compile",
  "Tighten the writing in the open file",
  "Add a bibliography with a few BibTeX entries",
];

export function ChatThread(props: {
  threadId: string;
  projectId: string;
  onTitleChange: (title: string) => void;
  openFile: string | null;
}) {
  const chat = useChat(props);
  const ai = useAiSettings();
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Text sent from elsewhere in the editor ("Send to chat" on the terminal, a code selection).
  useEffect(() => {
    const onAttach = (e: Event) => {
      const { name, text } = (e as CustomEvent<{ name: string; text: string }>).detail ?? {};
      if (!text) return;
      setAttachments((prev) =>
        prev.some((a) => a.name === name && a.text === text)
          ? prev
          : [...prev, { name, text: text.slice(0, MAX_ATTACHMENT_CHARS) }],
      );
    };
    window.addEventListener("somescript:attach-to-chat", onAttach);
    return () => window.removeEventListener("somescript:attach-to-chat", onAttach);
  }, []);

  const configured = (ai.settings?.providers.length ?? 0) > 0;
  const send = useCallback(
    (text: string) => {
      const files = attachments;
      setAttachments([]);
      void chat.send(text, files);
    },
    [attachments, chat],
  );

  const todoOwner = useMemo(() => latestTodoOwner(chat.messages), [chat.messages]);

  if (chat.loading || (!ai.settings && !ai.failed)) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground">
        <Spinner />
      </div>
    );
  }

  return (
    <div
      className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col bg-background"
      data-testid="chat-thread"
    >
      <Conversation className="min-h-0 min-w-0 w-full flex-1">
        <ConversationContent className="gap-5 p-3 min-w-0 w-full">
          {chat.messages.length === 0 ? (
            configured ? (
              <Welcome onPick={send} />
            ) : (
              <SetupPrompt />
            )
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
          onDismiss={chat.dismissError}
          onRetry={() => void chat.retry()}
        />
      )}

      <Composer
        disabled={!configured}
        running={chat.running}
        settings={ai.settings}
        attachments={attachments}
        onRemoveAttachment={(i) => setAttachments((prev) => prev.filter((_, j) => j !== i))}
        onSend={send}
        onStop={chat.stop}
        onChoose={(providerId, model) => void ai.choose(providerId, model)}
      />
    </div>
  );
}

/** The message that owns the plan card: only the newest `todo_write` is drawn, since each one replaces the last. */
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

function SetupPrompt() {
  return (
    <div
      className="flex flex-col items-center gap-3 px-2 pt-8 text-center"
      data-testid="chat-setup"
    >
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <KeyRound className="size-5 text-muted-foreground" />
      </div>
      <div className="grid gap-1">
        <h3 className="text-sm font-medium">Connect an AI provider</h3>
        <p className="text-xs text-muted-foreground">
          Bring your own API key (OpenAI, Anthropic, OpenRouter…) or point to a local model such as
          Ollama. Your key stays on this computer.
        </p>
      </div>
      <Button size="sm" onClick={openSettings}>
        <Settings /> Open settings
      </Button>
    </div>
  );
}

function UserBubble({ message }: { message: UserMessage }) {
  return (
    <div className="ml-auto flex max-w-[92%] flex-col items-end gap-1.5" data-testid="user-message">
      {message.attachments?.map((a, i) => (
        <span
          key={i}
          className="flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          <FileText className="size-3 shrink-0" />
          <span className="truncate">{a.name}</span>
        </span>
      ))}
      {message.text && (
        <div className="rounded-lg bg-secondary px-3 py-2 text-sm break-words whitespace-pre-wrap text-foreground">
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
      if (p.type === "tool" && p.name === "todo_write") return p.id;
    }
    return null;
  }, [m.parts]);
  const waiting =
    m.running &&
    (m.parts.length === 0 || (m.parts[last].type === "tool" && m.parts[last].status !== "running"));

  return (
    <div className="flex min-w-0 flex-col gap-2 text-sm" data-testid="assistant-message">
      {m.parts.map((p, i) => {
        switch (p.type) {
          case "text":
            return p.text.trim() ? (
              <div key={i} className="min-w-0 break-words" data-testid="assistant-text">
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
                className="mb-0"
              >
                <ReasoningTrigger />
                <ReasoningContent>{p.text}</ReasoningContent>
              </Reasoning>
            );
          case "notice":
            return (
              <p key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                {p.text}
              </p>
            );
          case "tool":
            if (p.name === "todo_write") {
              // Only the newest plan in the whole conversation is drawn.
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
          <Loader2 className="size-3.5 animate-spin" /> Working…
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
              <RotateCcw /> Retry
            </Button>
          )}
        </div>
      )}
      {!m.running && m.model && m.parts.length > 0 && (
        <span className="text-[10px] text-muted-foreground/70">
          {m.provider} · {m.model}
        </span>
      )}
    </div>
  );
}

function ErrorBanner(props: { message: string; onDismiss: () => void; onRetry: () => void }) {
  // Messages that point at the Settings screen get a button to it; retrying only makes sense
  // when something was actually attempted.
  const needsSettings = /settings|base url/i.test(props.message);
  const retryable = !/no ai provider|choose a model/i.test(props.message);
  return (
    <div
      role="alert"
      data-testid="chat-error"
      className="mx-2 mb-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
    >
      <span className="min-w-0 flex-1 break-words">{props.message}</span>
      <span className="flex shrink-0 items-center gap-1">
        {needsSettings && (
          <Button size="xs" variant="outline" onClick={openSettings}>
            <Settings /> Settings
          </Button>
        )}
        {retryable && (
          <Button size="xs" variant="outline" onClick={props.onRetry}>
            <RotateCcw /> Retry
          </Button>
        )}
        <button
          type="button"
          aria-label="Dismiss"
          onClick={props.onDismiss}
          className="rounded p-0.5 hover:bg-destructive/10"
        >
          <X className="size-3.5" />
        </button>
      </span>
    </div>
  );
}

function Composer(props: {
  disabled: boolean;
  running: boolean;
  settings: AiSettings | null;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onChoose: (providerId: string, model: string | null) => void;
}) {
  const [text, setText] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const canSend =
    !props.disabled && !props.running && (text.trim().length > 0 || props.attachments.length > 0);

  // Grow with the text, up to about eight lines.
  const syncHeight = useCallback(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = "auto";
    const scrollH = el.scrollHeight;
    // When hidden in an inactive tab or during transitions, scrollHeight can be 0.
    // Ensure height never collapses below 40px so the user can always see and click the input.
    const clamped = scrollH > 0 ? Math.min(Math.max(scrollH, 40), 176) : 40;
    el.style.height = `${clamped}px`;
  }, []);

  useEffect(() => {
    syncHeight();
  }, [text, syncHeight]);

  // When container visibility or size changes (e.g. switching back to chat tab), re-sync height
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
    // Enter confirms an IME candidate (Thai, Japanese, Chinese...); only a plain Enter sends.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 border-t border-border/60 p-2 min-w-0 w-full">
      <div className="w-full min-w-0 rounded-xl border border-border bg-background shadow-xs focus-within:ring-2 focus-within:ring-ring/30">
        {props.attachments.length > 0 && (
          <div className="flex flex-wrap gap-1 px-2 pt-2" data-testid="attachments">
            {props.attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="flex max-w-full items-center gap-1 rounded-md border border-border/60 bg-muted/40 py-0.5 pr-0.5 pl-1.5 text-[11px]"
              >
                <FileText className="size-3 shrink-0 text-muted-foreground" />
                <span className="truncate">{a.name}</span>
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
          placeholder={
            props.disabled ? "Connect a provider to start chatting" : "Ask about your document…"
          }
          onFocus={syncHeight}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          className="block min-h-[40px] max-h-44 w-full min-w-0 resize-none bg-transparent px-3 pt-2.5 pb-1 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
        />
        <div className="flex items-center gap-1 px-1.5 pb-1.5">
          <ModelPicker settings={props.settings} onChoose={props.onChoose} />
          <span className="ml-auto" />
          {props.running ? (
            <Button
              size="icon-sm"
              variant="outline"
              aria-label="Stop"
              data-testid="chat-stop"
              onClick={props.onStop}
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
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ModelPicker(props: {
  settings: AiSettings | null;
  onChoose: (providerId: string, model: string | null) => void;
}) {
  const { settings } = props;
  const choice = activeChoice(settings);
  if (!settings || !choice) {
    return (
      <Button size="xs" variant="ghost" onClick={openSettings} className="text-muted-foreground">
        <KeyRound /> Set up AI
      </Button>
    );
  }
  const activeId = settings.activeProviderId ?? settings.providers[0]?.id;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="xs"
          variant="ghost"
          className="max-w-[70%] text-muted-foreground"
          data-testid="model-picker"
        >
          <span className="truncate">
            {choice.name}
            {choice.model ? ` · ${choice.model}` : ""}
          </span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="max-h-80 w-64 overflow-auto">
        {settings.providers.map((p, index) => {
          const models = [...new Set([p.defaultModel, ...p.models].filter(Boolean))];
          return (
            <div key={p.id}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs">{p.name}</DropdownMenuLabel>
              {models.length === 0 && (
                <DropdownMenuItem onClick={openSettings} className="text-xs text-muted-foreground">
                  Add a model in Settings
                </DropdownMenuItem>
              )}
              {models.map((model) => {
                const selected = p.id === activeId && model === choice.model;
                return (
                  <DropdownMenuItem
                    key={model}
                    onClick={() => props.onChoose(p.id, model)}
                    className={cn("justify-between gap-2 text-xs", selected && "font-medium")}
                  >
                    <span className="truncate">{model}</span>
                    {selected && <Check className="size-3.5" />}
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={openSettings} className="text-xs">
          <Settings /> Manage providers…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
