"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEveAgent, type EveMessage, type EveMessagePart } from "eve/react";
import { useAuth } from "@clerk/nextjs";
import type { MessageStreamEvent, ClientSessionState } from "eve/client";
import * as Sentry from "@sentry/nextjs";

import type { EveMode } from "@/lib/eve-modes";
import { filterOrphanedMessages } from "@/lib/eve-messages";
import { collapseAppendedRuns, capOversizedPayloads } from "@/lib/thread-history";
import { saveThreadSnapshot, type ThreadSnapshot } from "@/lib/eve-threads-client";
import { notifyCreditsUpdated } from "@/hooks/use-credit-status";
import {
  extractAttachmentBlocks,
  mediaTypeOf,
  stripEventFileData,
  stripPartPlaceholders,
  type OutgoingPart,
} from "@/lib/attachment-blocks";
import {
  clipText,
  logEveAction,
  logEveError,
  logEveEvent,
  logEveWarn,
} from "@/lib/eve-diagnostics";
import type {
  AssistantPart,
  Attachment,
  ChatMessage,
  ToolPart,
  ToolResult,
  UserMessage,
} from "./types";

const MARKER_KEYS = ["mode", "projectId", "openFile"] as const;
const MARKER_PREFIX = new RegExp(`^(?:\\[(?:${MARKER_KEYS.join("|")}): [^\\]]*\\]\\n?)+`);

function buildContextMarker(
  values: Partial<Record<(typeof MARKER_KEYS)[number], string | null | undefined>>,
): string {
  return MARKER_KEYS.filter((key) => values[key])
    .map((key) => `[${key}: ${values[key]}]`)
    .join("\n");
}

const STALL_TIMEOUT_MS = 60_000;

const compactEvents = (events: readonly MessageStreamEvent[]) =>
  capOversizedPayloads(stripEventFileData(collapseAppendedRuns(events)));

function recordStepUsage(mode: EveMode, usage: { costUsd?: number; outputTokens: number }) {
  fetch("/api/eve/credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, ...usage }),
  })
    .then((res) => {
      logEveAction("credits:recorded", { mode, ...usage, ok: res.ok, status: res.status });
      if (res.ok) notifyCreditsUpdated();
    })
    .catch((e) =>
      logEveError("credits:failed", {
        mode,
        ...usage,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
}

const COMPILE_TOOL_NAME = "compile-project";

type CompileToolOutput = {
  ok?: boolean;
  path?: string;
  pdfPath?: string | null;
  log?: string;
  error?: string;
};

export type CompiledEventDetail = {
  ok: boolean;
  path: string;
  pdfPath: string | null;
  log: string | null;
};

export interface UseWebChat {
  messages: ChatMessage[];
  loading: boolean;
  running: boolean;
  error: string | null;
  contextUsage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  canContinue: boolean;
  continueTurn: () => void;
  stop: () => void;
  retry: () => Promise<void>;
  dismissError: () => void;
  send: (text: string, attachments?: Attachment[]) => Promise<void>;
  agent: ReturnType<typeof useEveAgent>;
}

export function useWebChat(opts: {
  threadId: string;
  projectId: string;
  mode: EveMode;
  openFile?: string | null;
  initialData: ThreadSnapshot<MessageStreamEvent, ClientSessionState> | null;
  onTitleChange: (title: string) => void;
}): UseWebChat {
  const { threadId, projectId, mode, openFile, initialData, onTitleChange } = opts;

  const completedToolCalls = useRef<Set<string>>(new Set());
  const compileStartedCalls = useRef<Set<string>>(new Set());
  const compileSettledCalls = useRef<Set<string>>(new Set());
  const seenSteps = useRef<Set<string>>(new Set());
  const toolsHydrated = useRef(false);
  const compactingRef = useRef(false);
  const turnIdRef = useRef<string | null>(null);
  const failureFromEventRef = useRef(false);
  const cursorPinnedRef = useRef<string | null>(null);
  const titleWrittenRef = useRef(false);

  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const openFileRef = useRef(openFile);
  useEffect(() => {
    openFileRef.current = openFile;
  }, [openFile]);

  const sentModeRef = useRef(mode);

  const [sendError, setSendError] = useState<string | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [pendingUserMessage, setPendingUserMessage] = useState<UserMessage | null>(null);

  const [contextUsage, setContextUsage] = useState<{
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null>(null);

  const { getToken } = useAuth();

  const agent = useEveAgent({
    auth: { bearer: async () => (await getToken()) ?? "" },
    initialEvents: initialData?.events,
    initialSession: initialData?.sessionState,
    onError: (error) => {
      if (failureFromEventRef.current) {
        failureFromEventRef.current = false;
        return;
      }
      turnIdRef.current = null;
      compactingRef.current = false;
      logEveError("stream:failed", { name: error.name, message: error.message });
      setSendError(`The assistant lost its connection: ${error.message}`);
      setCanContinue(true);
    },
    onEvent: (event) => {
      logEveEvent(event);

      if (event.type === "turn.failed" || event.type === "session.failed") {
        turnIdRef.current = null;
        compactingRef.current = false;
        failureFromEventRef.current = true;
        const { code, message } = event.data;
        setSendError(
          `The assistant stopped: ${message || "the model stream failed"}${code ? ` (${code})` : ""}`,
        );
        setCanContinue(event.type === "turn.failed");
        return;
      }

      if (event.type === "turn.started") turnIdRef.current = event.data.turnId;
      else if (event.type === "turn.completed" || event.type === "turn.cancelled") {
        turnIdRef.current = null;
        compactingRef.current = false;
      } else if (event.type === "compaction.requested") {
        compactingRef.current = true;
      } else if (event.type === "compaction.completed") {
        compactingRef.current = false;
      } else if (event.type === "step.completed") {
        const stepKey = `${event.data.turnId}:${event.data.stepIndex}`;
        const isRetry = seenSteps.current.has(stepKey);
        seenSteps.current.add(stepKey);

        const usage = event.data.usage;
        if (isRetry) {
          logEveWarn("step:retried", {
            turnId: event.data.turnId,
            stepIndex: event.data.stepIndex,
            sequence: event.data.sequence,
            finishReason: event.data.finishReason,
            inputTokens: usage?.inputTokens,
            outputTokens: usage?.outputTokens,
          });
        } else if (usage?.outputTokens) {
          recordStepUsage(sentModeRef.current, {
            costUsd: usage.costUsd,
            outputTokens: usage.outputTokens,
          });
        }

        if (usage?.inputTokens === undefined) return;
        setContextUsage((prev) => ({
          inputTokens: usage.inputTokens ?? 0,
          outputTokens: usage.outputTokens ?? 0,
          costUsd: (prev?.costUsd ?? 0) + (usage.costUsd ?? 0),
        }));
      }
    },
    onFinish: (snapshot) => {
      if (!snapshot.session?.sessionId) return;
      void saveThreadSnapshot(
        projectId,
        threadId,
        compactEvents(snapshot.events),
        snapshot.session,
      ).then((ok) => {
        if (!ok) logEveError("persist:failed", { threadId, events: snapshot.events.length });
      });
    },
  });

  const agentRef = useRef(agent);
  agentRef.current = agent;

  const isBusy = (agent.status === "submitted" || agent.status === "streaming") && !canContinue;
  const isPending = isBusy || isSending;

  const visibleMessages = useMemo(
    () => filterOrphanedMessages(agent.data.messages as EveMessage[], agent.events),
    [agent.data.messages, agent.events],
  );

  const convertEvePart = useCallback(
    (part: EveMessagePart, messageId: string, index: number): AssistantPart | null => {
      if (part.type === "text") {
        const text = part.text.replace(MARKER_PREFIX, "");
        return { type: "text", text };
      }

      if (part.type === "reasoning") {
        return { type: "reasoning", text: part.text };
      }

      if (part.type === "dynamic-tool") {
        const isTerminal =
          part.state === "output-available" ||
          part.state === "output-error" ||
          part.state === "output-denied";
        const isApproval =
          part.state === "approval-requested" ||
          part.state === "approval-responded" ||
          (!isTerminal &&
            (part.toolName === "ask_question" || Boolean(part.toolMetadata?.eve?.inputRequest)));
        const isSubagent = part.toolMetadata?.eve?.kind === "subagent-call";
        const displayToolName = isApproval
          ? "__hitl__"
          : isSubagent
            ? "__subagent__"
            : part.toolName;
        const status = part.state === "output-error" ? "error" : isTerminal ? "done" : "running";

        return {
          type: "tool",
          id: part.toolCallId,
          name: displayToolName,
          args: (part.input as Record<string, unknown>) ?? {},
          status,
          result: (part.output as ToolResult) ?? undefined,
          output:
            typeof part.output === "string"
              ? part.output
              : part.output
                ? JSON.stringify(part.output)
                : undefined,
          inputRequest:
            (part.toolMetadata?.eve?.inputRequest as ToolPart["inputRequest"]) ?? undefined,
          error:
            "errorText" in part && typeof part.errorText === "string" ? part.errorText : undefined,
        };
      }

      if (part.type === "authorization") {
        return {
          type: "tool",
          id: `auth-${messageId}-${index}`,
          name: "__oauth__",
          args: {
            name: part.name,
            displayName: part.displayName,
            description: part.description,
            authorization: part.authorization,
            state: part.state,
          },
          status: part.state === "required" ? "running" : "done",
          result:
            "outcome" in part
              ? ({
                  ok: part.outcome !== "failed" && part.outcome !== "timed-out",
                  outcome: part.outcome,
                } as ToolResult)
              : undefined,
        };
      }

      return null;
    },
    [],
  );

  const convertEveMessage = useCallback(
    (msg: EveMessage): ChatMessage => {
      if (msg.role === "user") {
        const textParts = msg.parts.filter(
          (p): p is Extract<EveMessagePart, { type: "text" }> => p.type === "text",
        );
        const fullText = textParts
          .map((p) => p.text)
          .join("\n")
          .replace(MARKER_PREFIX, "");
        const { text: withoutBlocks, blocks } = extractAttachmentBlocks(fullText);
        const attachments: Attachment[] = blocks.map((b) => ({
          name: b.name,
          text: b.body,
          type: "text",
        }));

        for (const part of msg.parts) {
          if (part.type !== "file" || !part.url) continue;
          const isImage = part.mediaType.startsWith("image/");
          attachments.push({
            name: part.filename ?? part.mediaType,
            text: "",
            url: part.url,
            type: isImage ? "image" : "file",
            mediaType: part.mediaType,
          });
        }

        return {
          id: msg.id,
          role: "user",
          text: stripPartPlaceholders(withoutBlocks),
          attachments: attachments.length > 0 ? attachments : undefined,
        };
      }

      const parts = msg.parts
        .map((part, i) => convertEvePart(part, msg.id, i))
        .filter((p): p is AssistantPart => p !== null);

      return {
        id: msg.id,
        role: "assistant",
        parts,
        running: isBusy && msg.id === visibleMessages.at(-1)?.id,
      };
    },
    [convertEvePart, isBusy, visibleMessages],
  );

  // Clear pendingUserMessage once Eve's store reflects the user turn
  useEffect(() => {
    if (!pendingUserMessage) return;
    const hasArrived = visibleMessages.some(
      (m) =>
        m.role === "user" &&
        (m.id === pendingUserMessage.id ||
          m.parts.some(
            (p) =>
              p.type === "text" &&
              p.text.replace(MARKER_PREFIX, "").trim() === pendingUserMessage.text.trim(),
          )),
    );
    if (hasArrived) {
      setPendingUserMessage(null);
    }
  }, [visibleMessages, pendingUserMessage]);

  const messages: ChatMessage[] = useMemo(() => {
    const list = visibleMessages.map(convertEveMessage);
    if (pendingUserMessage) {
      const alreadyPresent = list.some(
        (m) =>
          m.role === "user" &&
          (m.id === pendingUserMessage.id || m.text.trim() === pendingUserMessage.text.trim()),
      );
      if (!alreadyPresent) {
        list.push(pendingUserMessage);
        if (isPending) {
          list.push({
            id: `pending-assistant-${pendingUserMessage.id}`,
            role: "assistant",
            parts: [],
            running: true,
          });
        }
      }
    }
    return list;
  }, [visibleMessages, pendingUserMessage, isPending, convertEveMessage]);

  const abandonTurn = useCallback(async () => {
    logEveAction("cancel:requested", {
      sessionId: agent.session?.sessionId,
      turnId: turnIdRef.current,
      status: agent.status,
    });
    try {
      const result = await agent.cancel();
      logEveAction("cancel:accepted", { result });
    } catch (e) {
      logEveError("cancel:failed", { error: e instanceof Error ? e.message : String(e) });
    }
  }, [agent]);

  const isAwaitingTool = useMemo(() => {
    const msgs = agent.data.messages as EveMessage[] | undefined;
    const last = msgs?.at(-1);
    if (last?.role !== "assistant") return false;
    return last.parts.some((part) =>
      part.type === "dynamic-tool"
        ? part.state !== "output-available" &&
          part.state !== "output-error" &&
          part.state !== "output-denied"
        : part.type === "authorization" && part.state === "required",
    );
  }, [agent.data.messages]);

  useEffect(() => {
    if (!isBusy || isAwaitingTool || compactingRef.current) return;
    const timer = setTimeout(() => {
      logEveError("stall:timeout", {
        afterMs: STALL_TIMEOUT_MS,
        status: agentRef.current.status,
        turnId: turnIdRef.current,
      });
      void abandonTurn();
      setSendError(
        "The assistant stopped responding. Continue to try picking up where it left off.",
      );
      setCanContinue(true);
    }, STALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [abandonTurn, isAwaitingTool, isBusy]);

  const continueTurn = useCallback(() => {
    setSendError(null);
    setCanContinue(false);
    failureFromEventRef.current = false;
    logEveAction("continue", { sessionId: agent.session?.sessionId });
    agent.send("continue").catch((e) => {
      logEveError("continue:failed", { error: e instanceof Error ? e.message : String(e) });
      setSendError(e instanceof Error ? e.message : String(e));
    });
  }, [agent]);

  const send = useCallback(
    async (text: string, attachments?: Attachment[]) => {
      setIsSending(true);
      failureFromEventRef.current = false;
      const userMessageId = crypto.randomUUID();
      const optimisticMsg: UserMessage = {
        id: userMessageId,
        role: "user",
        text,
        attachments,
      };
      setPendingUserMessage(optimisticMsg);

      try {
        // Pre-flight credit check
        try {
          const res = await fetch("/api/eve/credits", {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const status: {
              includedBalance: number;
              purchasedBalance: number;
              allowedModes: EveMode[];
            } = await res.json();
            if (!status.allowedModes.includes(modeRef.current)) {
              setSendError(
                `${modeRef.current} mode isn't available on your plan. Upgrade to unlock it.`,
              );
              setPendingUserMessage(null);
              return;
            }
            if (status.includedBalance + status.purchasedBalance <= 0) {
              setSendError(
                "Out of AI credits for this workspace this month. Upgrade or buy a top-up to continue.",
              );
              setPendingUserMessage(null);
              return;
            }
          }
        } catch (e) {
          console.error("Credit pre-flight check failed, sending anyway", e);
        }

        // Force save any unsaved changes in editor
        const promises: Promise<unknown>[] = [];
        window.dispatchEvent(new CustomEvent("somescript:force-save", { detail: { promises } }));
        if (promises.length > 0) {
          try {
            await Promise.all(promises);
          } catch (e) {
            console.error("Failed to force save before sending message", e);
          }
        }

        let outgoingParts: OutgoingPart[] = [];
        if (text.trim()) {
          outgoingParts.push({ type: "text", text });
        }

        if (attachments && attachments.length > 0) {
          for (const att of attachments) {
            if ((att.type === "image" || att.type === "file") && att.url) {
              outgoingParts.push({
                type: "file",
                mediaType: att.mediaType ?? mediaTypeOf(att.url),
                data: att.url,
                filename: att.name,
              });
            } else if (att.text) {
              outgoingParts.push({
                type: "text",
                text: `<attachment name=${att.name}>\n${att.text}\n</attachment>`,
              });
            }
          }
        }

        // Defensive: Lite is text-only
        if (modeRef.current === "lite") {
          outgoingParts = outgoingParts.filter(
            (p) =>
              !(
                p.type === "file" &&
                (p.mediaType.startsWith("image/") || p.mediaType === "application/pdf")
              ),
          );
        }

        if (outgoingParts.length > 0) {
          const marker = buildContextMarker({
            mode: modeRef.current,
            projectId,
            openFile: openFileRef.current,
          });
          const textPart = outgoingParts.find(
            (p): p is Extract<OutgoingPart, { type: "text" }> => p.type === "text",
          );
          if (textPart) {
            textPart.text = `${marker}\n${textPart.text}`;
          } else {
            outgoingParts.unshift({ type: "text", text: marker });
          }

          const firstPart = outgoingParts[0];
          const sendArgs: Parameters<typeof agent.send>[0] =
            outgoingParts.length === 1 && firstPart.type === "text"
              ? firstPart.text
              : outgoingParts;

          try {
            setSendError(null);
            setCanContinue(false);
            sentModeRef.current = modeRef.current;
            logEveAction("send", {
              mode: sentModeRef.current,
              parts: outgoingParts.length,
              chars: outgoingParts.reduce((n, p) => n + (p.type === "text" ? p.text.length : 0), 0),
              text: clipText(textPart?.text),
            });
            await agent.send(sendArgs);
          } catch (e) {
            setSendError(e instanceof Error ? e.message : String(e));
            logEveError("send:failed", { error: e instanceof Error ? e.message : String(e) });
            setPendingUserMessage(null);
          }
        }
      } finally {
        setIsSending(false);
      }
    },
    [agent, projectId],
  );

  const retry = useCallback(async () => {
    const lastUser = [...messages].reverse().find((m): m is UserMessage => m.role === "user");
    if (!lastUser) return;
    await send(lastUser.text, lastUser.attachments);
  }, [messages, send]);

  // Session cursor pinning
  useEffect(() => {
    const sessionId = agent.session?.sessionId;
    if (!sessionId || cursorPinnedRef.current === sessionId) return;
    cursorPinnedRef.current = sessionId;
    void saveThreadSnapshot(projectId, threadId, compactEvents(agent.events), agent.session);
    Sentry.setContext("eve", { sessionId, threadId, projectId, mode: modeRef.current });
  }, [threadId, projectId, agent.session, agent.events]);

  // First user message thread title
  useEffect(() => {
    if (titleWrittenRef.current) return;
    const firstUserMessage = agent.data?.messages?.find((m) => m.role === "user");
    const firstPart = firstUserMessage?.parts?.find(
      (p: { type: string; text?: string }) => p.type === "text",
    );
    if (!firstPart || !("text" in firstPart) || !firstPart.text) return;
    const cleanText = firstPart.text.replace(MARKER_PREFIX, "").trim();
    if (!cleanText) return;

    titleWrittenRef.current = true;
    onTitleChange(cleanText.length > 25 ? cleanText.substring(0, 22) + "..." : cleanText);
  }, [threadId, projectId, agent.data?.messages, onTitleChange]);

  // Completed tool call listeners and workspace dispatch
  useEffect(() => {
    if (!agent.data?.messages) return;
    const replaying = !toolsHydrated.current;
    toolsHydrated.current = true;

    let shouldRefresh = false;
    let wrotePath: string | null = null;
    let compileStarted = false;
    let compiled: CompiledEventDetail | null = null;

    for (const msg of agent.data.messages) {
      if (msg.role === "assistant" && msg.parts) {
        for (const part of msg.parts) {
          if (part.type === "dynamic-tool" && part.state === "output-available") {
            const toolCallId = part.toolCallId;
            if (!completedToolCalls.current.has(toolCallId)) {
              completedToolCalls.current.add(toolCallId);
              const name = part.toolName;
              if (
                name === "write_file" ||
                name === "write-file" ||
                name === "delete_file" ||
                name === "delete-file" ||
                name === "move" ||
                name === "main-file"
              ) {
                shouldRefresh = true;
              }
              if (name === "write_file" || name === "write-file" || name === "edit-file") {
                const input = part.input as { path?: string } | undefined;
                const output = part.output as { ok?: boolean; path?: string } | undefined;
                const path = input?.path ?? output?.path;
                if (path && output?.ok !== false) wrotePath = path;
              }
            }
          }
        }
      }
    }

    for (const msg of agent.data.messages) {
      if (msg.role !== "assistant" || !msg.parts) continue;
      for (const part of msg.parts) {
        if (part.type !== "dynamic-tool" || part.toolName !== COMPILE_TOOL_NAME) continue;

        const isSettled =
          part.state === "output-available" ||
          part.state === "output-error" ||
          part.state === "output-denied";

        if (!isSettled) {
          if (!compileStartedCalls.current.has(part.toolCallId)) {
            compileStartedCalls.current.add(part.toolCallId);
            compileStarted = true;
          }
          continue;
        }

        if (compileSettledCalls.current.has(part.toolCallId)) continue;
        compileSettledCalls.current.add(part.toolCallId);

        const output =
          part.state === "output-available"
            ? (part.output as CompileToolOutput | undefined)
            : undefined;

        compiled =
          output && !output.error
            ? {
                ok: Boolean(output.ok),
                path: output.path ?? "",
                pdfPath: output.pdfPath ?? null,
                log: output.log ?? "",
              }
            : { ok: false, path: "", pdfPath: null, log: null };
      }
    }

    if (replaying) return;

    if (shouldRefresh) {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
    if (wrotePath) {
      logEveAction("edit:applied", { path: wrotePath });
      window.dispatchEvent(new CustomEvent("somescript:open-file", { detail: wrotePath }));
    }
    if (compileStarted) {
      window.dispatchEvent(new CustomEvent("somescript:compiling"));
    }
    if (compiled) {
      logEveAction("compile:settled", {
        ok: compiled.ok,
        path: compiled.path,
        hasLog: compiled.log !== null,
      });
      window.dispatchEvent(
        new CustomEvent<CompiledEventDetail>("somescript:compiled", { detail: compiled }),
      );
    }
  }, [agent.data?.messages]);

  useEffect(() => {
    if (agent.status === "ready") {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
  }, [agent.status]);

  const error = sendError ?? (agent.error ? agent.error.message : null);

  return {
    messages,
    loading: false,
    running: isPending,
    error,
    contextUsage,
    canContinue,
    continueTurn,
    stop: abandonTurn,
    retry,
    dismissError: () => {
      setSendError(null);
      setCanContinue(false);
    },
    send,
    agent,
  };
}
