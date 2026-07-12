"use client";

import React from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { EveAgentContext } from "@/components/chat/eve-agent-context";
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
  ListFilesToolUI,
  ListFilesSnakeToolUI,
  TodoToolUI,
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
export function EveThread({ threadId, projectId }: { threadId: string; projectId: string }) {
  const { runtime, agent } = useEveRuntime(threadId, projectId);

  return (
    <EveAgentContext.Provider value={agent}>
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
        <ListFilesToolUI />
        <ListFilesSnakeToolUI />
        <TodoToolUI />

        <div className="h-full flex flex-col bg-background">
          <Thread />
        </div>
      </AssistantRuntimeProvider>
    </EveAgentContext.Provider>
  );
}
