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
  imageMarkerFor,
  mediaTypeOf,
  parseImageMarker,
  stripPartPlaceholders,
  type OutgoingPart,
} from "@/lib/attachment-blocks";
import { chatImages, newImageId, saveChatImages } from "@/lib/chat-images";

// Images inline as data URLs, text/markdown/csv/… wrapped in <attachment> tags.
// Stateless, so one instance for the whole app.
const attachmentAdapter = new CompositeAttachmentAdapter([
  new SimpleImageAttachmentAdapter(),
  new SimpleTextAttachmentAdapter(),
]);

// The link between a message and its images is an id carried inside the same
// "[projectId: …]" marker we already inject and already strip, because that
// marker is a *text* part and text is the one thing Eve's flattening preserves
// verbatim. Keying on it (rather than on message order, or on the placeholder,
// which is spelled differently by each side) survives the optimistic message
// being swapped for the server echo, and repeated sends of identical text.
// The pixels themselves live in @/lib/chat-images.
const imageIdOf = (msg: EveMessage): string | undefined => {
  for (const part of msg.parts) {
    if (part.type !== "text" || typeof part.text !== "string") continue;
    const id = parseImageMarker(part.text);
    if (id) return id;
  }
  return undefined;
};

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

      // Re-attach the images this message was sent with. Missing entry (cleared
      // storage, another device) simply renders no tile.
      const imageId = msg.role === "user" ? imageIdOf(msg) : undefined;
      if (imageId) {
        chatImages(threadId, imageId).forEach((image, i) => {
          attachments.push({
            id: `${msg.id}-image-${i}`,
            type: "image",
            name: image.name,
            contentType: mediaTypeOf(image.url),
            status: { type: "complete" },
            content: [{ type: "image", image: image.url }],
          });
        });
      }

      return {
        id: msg.id,
        role: msg.role,
        content: content as unknown as ThreadMessageLike["content"],
        attachments,
      };
    },
    // agent.data.messages is the change signal: assistant-ui caches one
    // conversion per message object and only drops that cache when this
    // callback's identity changes, so a just-sent image needs it to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the message list is a signal here, not a value this callback reads
    [convertEvePart, threadId, agent.data.messages],
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
      const { parts: attachmentParts, images } = attachmentsToParts(
        message.attachments ?? [],
      );
      parts.push(...attachmentParts);

      if (parts.length > 0) {
        // Keep the pixels before sending: the send drops them, and the
        // optimistic message renders immediately after.
        const imageId = images.length > 0 ? newImageId() : undefined;
        if (imageId) saveChatImages(threadId, imageId, images);

        const marker = imageMarkerFor(projectId, imageId);
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
    [agent, projectId, threadId],
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
      localStorage.setItem(
        `eve-thread-${threadId}`,
        JSON.stringify({
          events: agent.events,
          sessionState: agent.session,
        })
      );

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
