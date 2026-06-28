"use client";

import React from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { Thread } from "@/components/assistant-ui/thread";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { useEveRuntime } from "@/hooks/use-eve-runtime";
import { EveToolCalls } from "@/components/assistant-ui/eve-tool-calls";
import { EveAgentContext } from "@/components/chat/eve-agent-context";
import type { ToolCallMessagePartComponent } from "@assistant-ui/react";

/**
 * Dispatches tool call parts to the matching Eve visual card, or falls back
 * to assistant-ui's default collapsible ToolFallback for unknown tools.
 */
const CustomToolFallback: ToolCallMessagePartComponent = (props) => {
  const ToolComponent = EveToolCalls[props.toolName];
  if (ToolComponent) {
    return <ToolComponent {...props} />;
  }
  return <ToolFallback {...props} />;
};

/**
 * Full-featured AI chat powered by assistant-ui + Eve Framework.
 *
 * - Streaming markdown with code highlighting
 * - Native collapsible reasoning/thinking blocks
 * - Tool cards: web_search, bash, read_file, write_file, todo, glob, grep…
 * - HITL approval + ask_question prompts (wired to agent.send)
 * - OAuth/connection authorization flow
 * - Subagent delegation status
 * - Image & file attachment composer (drag-drop, paste, picker)
 * - Voice dictation (via browser Speech API)
 * - Stop button, copy, branch picker
 */
export function EveThread() {
  const { runtime, agent } = useEveRuntime();

  return (
    <EveAgentContext.Provider value={agent}>
      <AssistantRuntimeProvider runtime={runtime}>
        <div className="h-full flex flex-col bg-background">
          <Thread
            components={{
              ToolFallback: CustomToolFallback,
            }}
          />
        </div>
      </AssistantRuntimeProvider>
    </EveAgentContext.Provider>
  );
}
