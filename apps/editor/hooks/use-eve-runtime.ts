"use client";

import {
  useExternalStoreRuntime,
  type ThreadMessageLike,
  type AppendMessage,
} from "@assistant-ui/react";
import { useEveAgent } from "eve/react";
import { useCallback, useEffect, useState, useRef } from "react";
import type { EveMessage, EveMessagePart } from "eve/react";

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
      // 1. Plain text — assistant-ui TextMessagePart
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
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
    (msg: EveMessage): ThreadMessageLike => ({
      id: msg.id,
      role: msg.role,
      content: msg.parts
        .map((part, i) => convertEvePart(part, msg.id, i))
        .filter((p): p is NonNullable<typeof p> => p !== null) as unknown as ThreadMessageLike["content"],
    }),
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

      type OutgoingPart =
        | { type: "text"; text: string }
        | { type: "image"; image: string }
        | { type: "file"; data: ArrayBuffer; mimeType: string };
      const parts: OutgoingPart[] = [];

      for (const part of message.content) {
        if (part.type === "text") {
          parts.push({ type: "text", text: part.text });
        } else if (part.type === "image") {
          parts.push({ type: "image", image: part.image });
        } else if (part.type === "file") {
          try {
            const filePart = part as { file?: File };
            if (filePart.file) {
              const fileObj = filePart.file;
              const isText =
                fileObj.type.startsWith("text/") ||
                fileObj.name.endsWith(".tex") ||
                fileObj.name.endsWith(".bib") ||
                fileObj.name.endsWith(".txt") ||
                fileObj.name.endsWith(".json") ||
                fileObj.name.endsWith(".md");

              if (isText) {
                const text = await fileObj.text();
                parts.push({
                  type: "text",
                  text: `Attached file [${fileObj.name}]:\n\`\`\`\n${text}\n\`\`\``,
                });
              } else if (fileObj.type.startsWith("image/")) {
                const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(fileObj);
                });
                parts.push({ type: "image", image: base64 });
              } else {
                parts.push({
                  type: "file",
                  data: await fileObj.arrayBuffer(),
                  mimeType: fileObj.type,
                });
              }
            }
          } catch (e) {
            console.error("Failed to read attached file", e);
          }
        }
      }

      if (parts.length > 0) {
        const textPart = parts.find(
          (p): p is Extract<OutgoingPart, { type: "text" }> => p.type === "text"
        );
        if (textPart) {
          textPart.text = `[projectId: ${projectId}]\n${textPart.text}`;
        } else {
          parts.unshift({ type: "text", text: `[projectId: ${projectId}]` });
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
          if (threadIndex !== -1 && list[threadIndex].title === "New Chat") {
            const firstUserMessage = agent.data?.messages?.find((m) => m.role === "user");
            const firstPart = firstUserMessage?.parts?.find(
              (p: { type: string; text?: string }) => p.type === "text"
            );
            if (firstPart && "text" in firstPart && firstPart.text) {
              const cleanText = firstPart.text.trim();
              list[threadIndex].title = cleanText.length > 25 ? cleanText.substring(0, 22) + "..." : cleanText;
              localStorage.setItem("eve-threads-list", JSON.stringify(list));
              window.dispatchEvent(new Event("storage"));
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
            }
          }
        }
      }
    }

    if (shouldRefresh) {
      window.dispatchEvent(new CustomEvent("somescript:refresh-workspace"));
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
