"use client";

import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useExternalStoreRuntime,
  generateId,
  type AttachmentAdapter,
  type PendingAttachment,
  type CompleteAttachment,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useEveAgent } from "eve/react";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import type { EveMessage, EveMessagePart } from "eve/react";
import {
  attachmentsToParts,
  extractAttachmentBlocks,
  stripEventFileData,
  stripPartPlaceholders,
  type OutgoingPart,
} from "@/lib/attachment-blocks";
import type { EveMode } from "@/lib/eve-modes";
import type { HandleMessageStreamEvent, SessionState } from "eve/client";
import { loadThreadHistory, saveThreadHistory } from "@/lib/thread-history";
import { notifyCreditsUpdated } from "@/hooks/use-credit-status";

// Leading "[mode: …]" / "[projectId: …]" context markers we inject in onNew: the
// model (and the dynamic model resolver) still receive them, but users shouldn't
// see them in rendered text or thread titles.
const MARKER_PREFIX = /^(?:\[(?:projectId|mode): [^\]]*\]\n?)+/;

// eve's NDJSON turn stream can go silent forever without erroring on Vercel
// deployments: the CDN brotli-compresses the low-throughput stream (our
// vercel.json + apps/editor/next.config.ts's withEve match the setup in the
// report below exactly), and the final bytes — carrying the turn's terminal
// event — sit in the compression buffer and never flush. Short replies (a
// one-word prompt's answer) are the highest-risk case since there's little
// data to force a flush. agent.status then never leaves "submitted"/
// "streaming" and the composer spins forever. Open upstream, unfixed as of
// eve 0.27.6 (latest): https://github.com/vercel/eve/issues/1159 — real fix
// in flight at https://github.com/vercel/eve/pull/1186 (adds a native
// streamIdleTimeoutMs idle-reconnect).
const STALL_TIMEOUT_MS = 30_000;

// assistant-ui only ships Simple adapters for images and text. PDFs get the
// same treatment: read as a data URL, forward as a generic `file` content
// part — attachmentsToParts (lib/attachment-blocks.ts) already knows how to
// route that to Eve's wire format, same as it does for images.
class SimplePdfAttachmentAdapter implements AttachmentAdapter {
  public accept = "application/pdf";

  public async add(state: { file: File }): Promise<PendingAttachment> {
    return {
      id: generateId(),
      type: "document",
      name: state.file.name,
      contentType: state.file.type,
      file: state.file,
      status: { type: "requires-action", reason: "composer-send" },
    };
  }

  public async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(attachment.file);
    });
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "file",
          data,
          mimeType: attachment.file.type || "application/pdf",
          filename: attachment.name,
        },
      ],
    };
  }

  public async remove() {
    // noop
  }
}

export function useEveRuntime(
  threadId: string,
  projectId: string,
  mode: EveMode,
) {
  const completedToolCalls = useRef<Set<string>>(new Set());
  const processedSteps = useRef<Set<string>>(new Set());
  // Read inside onNew, which assistant-ui may hold across renders — a ref keeps
  // the marker in sync with the live selection without rebuilding the runtime.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  // Separate from modeRef: the composer is disabled while a turn streams, but the
  // mode picker isn't, so modeRef can change mid-turn. Credit deduction needs the
  // mode that was actually sent for the in-flight turn, captured at send time.
  const sentModeRef = useRef(mode);

  // Lite is not a vision model, so its composer offers no image/PDF adapter:
  // the file picker's `accept` (read live from the active adapter) drops them
  // and drag/paste `add` rejects them. Pro/Expert keep image + PDF + text.
  const attachmentAdapter = useMemo(
    () =>
      new CompositeAttachmentAdapter(
        mode === "lite"
          ? [new SimpleTextAttachmentAdapter()]
          : [
              new SimpleImageAttachmentAdapter(),
              new SimplePdfAttachmentAdapter(),
              new SimpleTextAttachmentAdapter(),
            ],
      ),
    [mode],
  );
  // A send that throws leaves no message behind — the composer has already
  // cleared — so the failure has to be surfaced or it looks like nothing
  // happened at all.
  const [sendError, setSendError] = useState<string | null>(null);

  // Load initial state synchronously on mount/remount. A blob written by a
  // different eve client is replayed into this one's reducer and session, so a
  // shape change between versions can wedge the whole thread; bump the stamp
  // whenever eve is upgraded and the mismatched blob is dropped for a fresh
  // session instead.
  const [initialData] = useState(() =>
    typeof window === "undefined"
      ? null
      : loadThreadHistory<HandleMessageStreamEvent, SessionState>(
          threadId,
          localStorage,
        ),
  );

  const agent = useEveAgent({
    initialEvents: initialData?.events,
    initialSession: initialData?.sessionState,
  });

  const convertEvePart = useCallback(
    (part: EveMessagePart, messageId: string, index: number) => {
      // 1. Plain text — assistant-ui TextMessagePart.
      //    Hide the leading [mode: …]/[projectId: …] markers we inject in onNew:
      //    the model still receives them, but users shouldn't see them.
      if (part.type === "text") {
        const text = part.text.replace(MARKER_PREFIX, "");
        return { type: "text" as const, text };
      }

      // 2. Reasoning/thinking — assistant-ui native ReasoningMessagePart (renders
      //    via the built-in <ReasoningRoot> collapsible in thread.tsx)
      if (part.type === "reasoning") {
        return { type: "reasoning" as const, text: part.text };
      }

      // 3. Dynamic tool calls — covers all Eve harness tools, HITL, subagents.
      //    The toolName is overridden so EveToolCalls can dispatch to the right card.
      if (part.type === "dynamic-tool") {
        // HITL: either explicit approval states, or the tool itself is ask_question,
        // or an inputRequest object has already been populated by Eve.
        const isApproval =
          part.state === "approval-requested" ||
          part.state === "approval-responded" ||
          part.toolName === "ask_question" ||
          Boolean(part.toolMetadata?.eve?.inputRequest);
        const isSubagent =
          part.toolMetadata?.eve?.kind === "subagent-call";

        // Resolved display toolName for our custom card registry
        const displayToolName = isApproval
          ? "__hitl__"
          : isSubagent
          ? "__subagent__"
          : part.toolName;

        return {
          type: "tool-call" as const,
          toolCallId: part.toolCallId,
          toolName: displayToolName,
          args: {
            // Raw input for display
            input: part.input,
            // Keep original tool name available inside the card
            toolName: part.toolName,
            toolMetadata: part.toolMetadata,
            state: part.state,
            // HITL input request — carries requestId, prompt, options
            inputRequest:
              isApproval
                ? part.toolMetadata?.eve?.inputRequest
                : undefined,
            errorText:
              "errorText" in part ? part.errorText : undefined,
          },
          result: "output" in part ? part.output : undefined,
          isError: part.state === "output-error",
        } as unknown as ThreadMessageLike["content"][number];
      }

      // 4. OAuth/connection authorization
      if (part.type === "authorization") {
        return {
          type: "tool-call" as const,
          toolCallId: `auth-${messageId}-${index}`,
          toolName: "__oauth__",
          args: {
            name: part.name,
            displayName: part.displayName,
            description: part.description,
            authorization: part.authorization,
            state: part.state,
            outcome: "outcome" in part ? part.outcome : undefined,
          },
          result: "outcome" in part ? part.outcome : undefined,
          isError:
            "outcome" in part &&
            (part.outcome === "failed" || part.outcome === "timed-out"),
        } as unknown as ThreadMessageLike["content"][number];
      }

      // step-start and unknown part types: skip
      return null;
    },
    [],
  );

  const convertEveMessage = useCallback(
    (msg: EveMessage): ThreadMessageLike => {
      type UiPart = Exclude<ThreadMessageLike["content"], string>[number];
      const parts = msg.parts
        .map((part, i) => convertEvePart(part, msg.id, i))
        .filter((p): p is NonNullable<typeof p> => p !== null) as UiPart[];

      // Pull "<attachment name=…>" blocks out of the text and back into real
      // attachments, so a pasted file or terminal log renders as a chip instead
      // of a wall of text. The model still received the full inlined version.
      // User messages only: assistant text merely *mentioning* the tag must not
      // sprout chips (and assistant parts stream, so a block could match half-open).
      const attachments: NonNullable<ThreadMessageLike["attachments"]>[number][] = [];
      const content = parts
        .map((part) => {
          if (msg.role !== "user") return part;
          if (part.type !== "text") return part;
          const { text: withoutBlocks, blocks } = extractAttachmentBlocks(part.text);
          for (const block of blocks) {
            attachments.push({
              id: `${msg.id}-attachment-${attachments.length}`,
              type: "document",
              name: block.name,
              contentType: "text/plain",
              status: { type: "complete" },
              content: [{ type: "text", text: block.body }],
            });
          }
          // Drop the "[file: …]" line Eve leaves where the image was, so the
          // tile below is the only thing representing it.
          return { ...part, text: stripPartPlaceholders(withoutBlocks) };
        })
        .filter((part) => part.type !== "text" || part.text.length > 0);

      // Eve projects what the user attached back onto the message as `file`
      // parts carrying the data URL it was sent with, so the tile is rebuilt
      // from the message itself. A part without a `url` kept its bytes server
      // side (a sandbox ref); there is nothing to render, so it is skipped.
      for (const part of msg.parts) {
        if (part.type !== "file" || !part.url) continue;
        const isImage = part.mediaType.startsWith("image/");
        attachments.push({
          id: `${msg.id}-file-${attachments.length}`,
          type: isImage ? "image" : "file",
          name: part.filename ?? part.mediaType,
          contentType: part.mediaType,
          status: { type: "complete" },
          content: [
            isImage
              ? { type: "image", image: part.url }
              : { type: "file", data: part.url, mimeType: part.mediaType },
          ],
        });
      }

      return {
        id: msg.id,
        role: msg.role,
        content: content as unknown as ThreadMessageLike["content"],
        attachments,
      };
    },
    [convertEvePart],
  );

  const onNew = useCallback(
    async (message: AppendMessage) => {
      // Pre-flight credit/mode-access check. This is a UX gate, not the security
      // boundary — a client that skips it still gets billed (and can go negative)
      // by the server-side deduction below, so failing open on a network hiccup
      // here is safe: it doesn't bypass accounting, just the friendly early block.
      try {
        const res = await fetch("/api/eve/credits");
        if (res.ok) {
          const status: {
            includedBalance: number;
            purchasedBalance: number;
            allowedModes: EveMode[];
          } = await res.json();
          if (!status.allowedModes.includes(modeRef.current)) {
            setSendError(`${modeRef.current} mode isn't available on your plan. Upgrade to unlock it.`);
            return;
          }
          if (status.includedBalance + status.purchasedBalance <= 0) {
            setSendError("Out of AI credits for this workspace this month. Upgrade or buy a top-up to continue.");
            return;
          }
        }
      } catch (e) {
        console.error("Credit pre-flight check failed, sending anyway", e);
      }

      // Force save any unsaved changes in the editor before sending
      const promises: Promise<unknown>[] = [];
      window.dispatchEvent(
        new CustomEvent("somescript:force-save", { detail: { promises } })
      );
      if (promises.length > 0) {
        try {
          await Promise.all(promises);
        } catch (e) {
          console.error("Failed to force save before sending message", e);
        }
      }

      // Attachments arrive already converted by the adapters above: text files
      // as an <attachment> text part, images as a data URL. Names are kept
      // alongside the pixels so the tile can show the real filename.
      const parts: OutgoingPart[] = [];
      for (const part of message.content) {
        if (part.type === "text") parts.push({ type: "text", text: part.text });
      }
      let attachmentParts = attachmentsToParts(message.attachments ?? []).parts;
      // Defensive: Lite is text-only, so drop any image/PDF that slipped
      // through — e.g. attached in Pro, then switched to Lite before sending
      // (the adapter swap doesn't remove already-pending attachments).
      if (modeRef.current === "lite") {
        attachmentParts = attachmentParts.filter(
          (p) =>
            !(
              p.type === "file" &&
              (p.mediaType.startsWith("image/") || p.mediaType === "application/pdf")
            ),
        );
      }
      parts.push(...attachmentParts);

      if (parts.length > 0) {
        const marker = `[mode: ${modeRef.current}]\n[projectId: ${projectId}]`;
        const textPart = parts.find(
          (p): p is Extract<OutgoingPart, { type: "text" }> => p.type === "text"
        );
        if (textPart) {
          textPart.text = `${marker}\n${textPart.text}`;
        } else {
          parts.unshift({ type: "text", text: marker });
        }

        const firstPart = parts[0];
        try {
          setSendError(null);
          sentModeRef.current = modeRef.current;
          if (parts.length === 1 && firstPart.type === "text") {
            await agent.send({ message: firstPart.text });
          } else {
            await agent.send({
              message: parts as unknown as Parameters<typeof agent.send>[0]["message"],
            });
          }
        } catch (e) {
          // Rethrowing would reject into assistant-ui's send handler and vanish
          // silently, leaving a cleared composer and no message on screen.
          setSendError(e instanceof Error ? e.message : String(e));
          console.error("Failed to send message to Eve", e);
        }
      }
    },
    [agent, projectId],
  );

  const isBusy =
    agent.status === "submitted" || agent.status === "streaming";

  const runtime = useExternalStoreRuntime<EveMessage>({
    isRunning: isBusy,
    messages: agent.data.messages as EveMessage[],
    convertMessage: convertEveMessage,
    onNew,
    isDisabled: isBusy,
    adapters: { attachments: attachmentAdapter },
  });

  // Backstop for the stalled-stream bug above: if a turn produces no new
  // event for STALL_TIMEOUT_MS, abort it through eve's own public agent.stop()
  // (an AbortError eve's client already treats as a clean terminal state)
  // instead of leaving the spinner stuck forever. Re-armed on every event via
  // the `agent` dependency, since useEveAgent hands back a new snapshot object
  // on each one.
  // ponytail: this ends the turn (any partial answer already streamed stays
  // visible; the user re-sends) rather than transparently resuming mid-stream
  // like eve#1186 will — eve/react's public surface (send/stop/reset) has no
  // lower-level "resume this stream" hook to do better from here. Drop once
  // eve ships streamIdleTimeoutMs and the dependency is bumped past it.
  useEffect(() => {
    if (!isBusy) return;
    const timer = setTimeout(() => {
      setSendError(
        "Eve stopped responding — this is a known eve streaming issue on some deployments (github.com/vercel/eve/issues/1159). Please try again.",
      );
      agent.stop();
    }, STALL_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [agent, isBusy]);

  useEffect(() => {
    if (agent.session?.sessionId) {
      // Never throws: losing saved history is survivable, but an error out of
      // this effect unmounts the thread mid-conversation.
      if (!saveThreadHistory(threadId, stripEventFileData(agent.events), agent.session)) {
        console.error("Failed to persist chat history: localStorage is full");
      }

      // Auto-update the title of the conversation in the threads list based on the first user message
      const threadListRaw = localStorage.getItem("eve-threads-list");
      if (threadListRaw) {
        try {
          const list = JSON.parse(threadListRaw) as { id: string; title: string }[];
          const threadIndex = list.findIndex((t) => t.id === threadId);
          // Also repair threads whose title was previously saved as the raw
          // "[projectId: ...]" marker before this fix.
          const needsTitle =
            threadIndex !== -1 &&
            (list[threadIndex].title === "New Chat" ||
              list[threadIndex].title.startsWith("[projectId:"));
          if (needsTitle) {
            const firstUserMessage = agent.data?.messages?.find((m) => m.role === "user");
            const firstPart = firstUserMessage?.parts?.find(
              (p: { type: string; text?: string }) => p.type === "text"
            );
            if (firstPart && "text" in firstPart && firstPart.text) {
              // Strip the injected "[mode: …]"/"[projectId: …]" context markers
              // (same as convertEvePart) so the title shows the actual message.
              const cleanText = firstPart.text.replace(MARKER_PREFIX, "").trim();
              if (cleanText) {
                list[threadIndex].title =
                  cleanText.length > 25 ? cleanText.substring(0, 22) + "..." : cleanText;
                localStorage.setItem("eve-threads-list", JSON.stringify(list));
                window.dispatchEvent(new Event("storage"));
              }
            }
          }
        } catch (e) {
          console.error("Failed to update thread title", e);
        }
      }
    }
  }, [threadId, agent.events, agent.session, agent.data?.messages]);

  // Watch agent messages/events for completed tool calls
  useEffect(() => {
    if (!agent.data?.messages) return;

    let shouldRefresh = false;
    // Last file Eve successfully wrote this pass — the editor jumps to it, so a
    // multi-file turn lands on the file it finished with.
    let wrotePath: string | null = null;
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
                name === "move"
              ) {
                shouldRefresh = true;
              }
              if (name === "write_file" || name === "write-file") {
                const input = part.input as { path?: string } | undefined;
                const output = part.output as
                  | { ok?: boolean; path?: string }
                  | undefined;
                const path = input?.path ?? output?.path;
                if (path && output?.ok !== false) wrotePath = path;
              }
            }
          }
        }
      }
    }

    if (shouldRefresh) {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
    if (wrotePath) {
      window.dispatchEvent(
        new CustomEvent("somescript:open-file", { detail: wrotePath })
      );
    }
  }, [agent.data?.messages]);

  // Bill completed model-call steps against the workspace's AI credit balance.
  // step.completed is the only place real output-token usage is reported at all
  // (eve has no server-side post-turn hook — see agent/agent.ts) — this is the
  // authoritative deduction, not the pre-flight check above.
  // ponytail: client-reported, so a dropped tab/network between a step completing
  // and this POST leaves that step's cost unbilled. Bounded to one step, not
  // systematically exploitable. Upgrade path if it ever matters: server-side OTel
  // span capture via eve's defineInstrumentation setup() hook (registerOTel).
  useEffect(() => {
    if (!agent.events) return;
    for (const event of agent.events) {
      if (event.type !== "step.completed") continue;
      const key = `${event.data.turnId}:${event.data.stepIndex}`;
      if (processedSteps.current.has(key)) continue;
      processedSteps.current.add(key);

      const outputTokens = event.data.usage?.outputTokens;
      if (!outputTokens || outputTokens <= 0) continue;

      fetch("/api/eve/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: sentModeRef.current, outputTokens }),
      })
        .then((res) => {
          if (res.ok) notifyCreditsUpdated();
        })
        .catch((e) => console.error("Failed to record Eve credit usage", e));
    }
  }, [agent.events]);

  // Dispatch refresh when agent finishes all work
  useEffect(() => {
    if (agent.status === "ready") {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
  }, [agent.status]);

  const error = sendError ?? (agent.error ? agent.error.message : null);

  return { runtime, agent, error, dismissError: () => setSendError(null) };
}
