"use client";

import {
  CompositeAttachmentAdapter,
  SimpleImageAttachmentAdapter,
  SimpleTextAttachmentAdapter,
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useEveAgent } from "eve/react";
import { useCallback, useEffect, useState, useRef } from "react";
import type { EveMessage, EveMessagePart } from "eve/react";
import {
  attachmentsToParts,
  extractAttachmentBlocks,
  stripEventFileData,
  stripPartPlaceholders,
  type OutgoingPart,
} from "@/lib/attachment-blocks";

// Images inline as data URLs, text/markdown/csv/… wrapped in <attachment> tags.
// Stateless, so one instance for the whole app.
const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

export function useEveRuntime(threadId: string, projectId: string) {
  const completedToolCalls = useRef<Set<string>>(new Set());

  // Load initial state synchronously on mount/remount
  const [initialData] = useState(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem(`eve-thread-${threadId}`);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch {
      return null;
    }
  });

  const agent = useEveAgent({
    initialEvents: initialData?.events,
    initialSession: initialData?.sessionState,
  });

  const convertEvePart = useCallback(
    (part: EveMessagePart, messageId: string, index: number) => {
      // 1. Plain text — assistant-ui TextMessagePart.
      //    Hide the leading [projectId: ...] marker we inject in onNew: the model
      //    still receives it (it's how tools learn the project), but users shouldn't see it.
      if (part.type === "text") {
        const text = part.text.replace(/^\[projectId: [^\]]*\]\n?/, "");
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
      parts.push(...attachmentsToParts(message.attachments ?? []).parts);

      if (parts.length > 0) {
        const marker = `[projectId: ${projectId}]`;
        const textPart = parts.find(
          (p): p is Extract<OutgoingPart, { type: "text" }> => p.type === "text"
        );
        if (textPart) {
          textPart.text = `${marker}\n${textPart.text}`;
        } else {
          parts.unshift({ type: "text", text: marker });
        }

        const firstPart = parts[0];
        if (parts.length === 1 && firstPart.type === "text") {
          await agent.send({ message: firstPart.text });
        } else {
          await agent.send({
            message: parts as unknown as Parameters<typeof agent.send>[0]["message"],
          });
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


  useEffect(() => {
    if (agent.session?.sessionId) {
      try {
        localStorage.setItem(
          `eve-thread-${threadId}`,
          JSON.stringify({
            events: stripEventFileData(agent.events),
            sessionState: agent.session,
          })
        );
      } catch (e) {
        // Out of quota: a long turn's tool output can fill it on its own.
        // Losing the saved history is survivable; throwing here is not — an
        // error out of this effect unmounts the thread mid-conversation.
        console.error("Failed to persist chat history", e);
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
              // Strip the injected "[projectId: ...]" context marker (same as
              // convertEvePart) so the title shows the actual user message.
              const cleanText = firstPart.text.replace(/^\[projectId: [^\]]*\]\n?/, "").trim();
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

  // Dispatch refresh when agent finishes all work
  useEffect(() => {
    if (agent.status === "ready") {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
    }
  }, [agent.status]);

  return { runtime, agent };
}
