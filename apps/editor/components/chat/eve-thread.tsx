"use client";

import React from "react";
import { Loader2 } from "lucide-react";
import { DEFAULT_MODE, isEveMode, type EveMode } from "@/lib/eve-modes";
import { fetchThreadSnapshot, type ThreadSnapshot } from "@/lib/eve-threads-client";
import type { MessageStreamEvent, ClientSessionState } from "eve/client";
import { ModelModeContext } from "@/components/chat/model-mode-context";
import { ChatThread } from "@/components/chat/chat-thread";

type EveThreadSnapshot = ThreadSnapshot<MessageStreamEvent, ClientSessionState>;

const MODE_STORAGE_KEY = "eve-model-mode";

/**
 * Full-featured AI chat powered by native pure-reducer conversation engine + Eve Agent Framework.
 *
 * - Streaming markdown with code highlighting (Streamdown)
 * - Native collapsible reasoning/thinking blocks
 * - Tool cards: compile_project, write_file/edit_file (with diff viewing and undo), read_file,
 *   list_files, bash, web_search, web_fetch, todo, subagent
 * - HITL approval + ask_question prompts (wired to agent.respond)
 * - Image & file attachment composer (drag-drop, paste, picker)
 * - Model mode selector (Lite, Pro, Expert) without DOM teardown
 * - Live context usage meter
 */
export function EveThread({
  threadId,
  projectId,
  openFile,
  onTitleChange,
}: {
  threadId: string;
  projectId: string;
  /** Project-relative path of the open editor tab, so Eve can act on "this file". */
  openFile?: string | null;
  onTitleChange: (title: string) => void;
}) {
  const [mode, setMode] = React.useState<EveMode>(() => {
    if (typeof window === "undefined") return DEFAULT_MODE;
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    return isEveMode(saved) ? saved : DEFAULT_MODE;
  });

  React.useEffect(() => {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  const [snapshot, setSnapshot] = React.useState<EveThreadSnapshot | null | "loading">("loading");

  React.useEffect(() => {
    let cancelled = false;
    setSnapshot("loading");
    fetchThreadSnapshot<MessageStreamEvent, ClientSessionState>(projectId, threadId)
      .then((s) => {
        if (!cancelled) setSnapshot(s);
      })
      .catch(() => {
        if (!cancelled) setSnapshot(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, threadId]);

  if (snapshot === "loading") {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-xs font-mono text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Loading conversation...</span>
      </div>
    );
  }

  return (
    <ModelModeContext.Provider value={{ mode, setMode }}>
      <ChatThread
        threadId={threadId}
        projectId={projectId}
        mode={mode}
        openFile={openFile}
        initialData={snapshot}
        onTitleChange={onTitleChange}
      />
    </ModelModeContext.Provider>
  );
}
