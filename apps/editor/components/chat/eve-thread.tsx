"use client";

import React from "react";
import { AssistantRuntimeProvider, useComposerRuntime } from "@assistant-ui/react";
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
/**
 * Attaches text from elsewhere in the app (e.g. terminal output) to the
 * composer as a file, so it shows up as a chip instead of filling the input.
 */
function ComposerInbox() {
  const composer = useComposerRuntime();

  React.useEffect(() => {
    const onInsert = (e: Event) => {
      const { name, text } = (e as CustomEvent<{ name: string; text: string }>).detail;
      if (!text) return;
      composer.addAttachment(new File([text], name, { type: "text/plain" }));
    };
    window.addEventListener("somescript:attach-to-chat", onInsert);
    return () => window.removeEventListener("somescript:attach-to-chat", onInsert);
  }, [composer]);

  return null;
}

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
        <ComposerInbox />

        <div className="h-full flex flex-col bg-background">
          <Thread />
        </div>
      </AssistantRuntimeProvider>
    </EveAgentContext.Provider>
  );
}
