import { useCallback, useEffect, useRef, useState } from "react";
import { fetchThreadSnapshot, saveThreadSnapshot } from "@/lib/eve-threads-client";
import { startChat } from "./api";
import { readEvents } from "./ndjson";
import { applyEvent, sanitizeMessages, settle, titleFrom } from "./reduce";
import type { AssistantMessage, Attachment, ChatEvent, ChatMessage } from "./types";

// The editor page (apps/editor/app/page.tsx) listens for these window events; they are how the
// cloud assistant drives the editor too, so the desktop chat plugs into the same seams.
const emit = <T>(name: string, detail?: T) =>
  window.dispatchEvent(new CustomEvent(name, { detail }));

const uid = () => crypto.randomUUID();
/** How often an in-flight conversation is saved, so a crash loses seconds, not the whole reply. */
const SAVE_EVERY_MS = 2500;
const FILE_WRITERS = new Set(["write_file", "edit_file"]);
const FILE_CHANGERS = new Set(["write_file", "edit_file", "delete_file", "move_file"]);

/** Unsaved editor text goes to disk first, so the assistant reads what the user is looking at. */
async function flushEditor() {
  const promises: Promise<unknown>[] = [];
  emit("somescript:force-save", { promises });
  try {
    await Promise.all(promises);
  } catch {
    // A failed save is surfaced by the editor itself; the chat still goes ahead.
  }
}

export interface UseChat {
  messages: ChatMessage[];
  loading: boolean;
  running: boolean;
  /** A problem that stopped the turn before any reply existed (no provider, no project). */
  error: string | null;
  send: (text: string, attachments?: Attachment[]) => Promise<void>;
  stop: () => void;
  /** Re-asks the last question, dropping a failed or unsatisfying reply. */
  retry: () => Promise<void>;
  dismissError: () => void;
}

export function useChat(opts: {
  threadId: string;
  projectId: string;
  openFile: string | null;
  onTitleChange: (title: string) => void;
}): UseChat {
  const { threadId, projectId, onTitleChange } = opts;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  const runningRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const openFileRef = useRef(opts.openFile);
  const titleRef = useRef(onTitleChange);
  const lastSavedAt = useRef(0);
  useEffect(() => {
    openFileRef.current = opts.openFile;
    titleRef.current = onTitleChange;
  });

  const commit = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const persist = useCallback(
    (list: ChatMessage[]) => {
      lastSavedAt.current = Date.now();
      // Never save a half-streamed state as "running": a reload would show a spinner forever.
      const safe = list.map((m) => (m.role === "assistant" && m.running ? settle(m) : m));
      void saveThreadSnapshot(projectId, threadId, safe, null);
    },
    [projectId, threadId],
  );

  // Load this conversation. Opening a thread while another is mid-run isn't possible (the panel
  // remounts per thread and its cleanup stops the run), so a plain load is enough.
  useEffect(() => {
    let cancelled = false;
    fetchThreadSnapshot(projectId, threadId)
      .then((snapshot) => {
        if (cancelled) return;
        const saved = (snapshot as { messages?: unknown } | null)?.messages;
        commit(sanitizeMessages(saved));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      // Leaving the panel (another chat, another project) ends the run; what arrived is kept.
      abortRef.current?.abort();
    };
  }, [projectId, threadId, commit]);

  const runTurn = useCallback(
    async (history: ChatMessage[]) => {
      const assistantId = uid();
      const placeholder: AssistantMessage = {
        id: assistantId,
        role: "assistant",
        parts: [],
        running: true,
      };
      commit([...history, placeholder]);
      const controller = new AbortController();
      abortRef.current = controller;
      runningRef.current = true;
      setRunning(true);
      setError(null);

      const toolNames = new Map<string, string>();
      let wrotePath: string | null = null;
      let changedFiles = false;
      let pending: ChatEvent[] = [];
      let frame = 0;

      const patch = (fn: (m: AssistantMessage) => AssistantMessage) =>
        commit(
          messagesRef.current.map((m) =>
            m.role === "assistant" && m.id === assistantId ? fn(m) : m,
          ),
        );
      const flush = () => {
        frame = 0;
        if (pending.length === 0) return;
        const batch = pending;
        pending = [];
        patch((m) => batch.reduce(applyEvent, m));
        if (Date.now() - lastSavedAt.current > SAVE_EVERY_MS) persist(messagesRef.current);
      };

      const sideEffects = (ev: ChatEvent) => {
        if (ev.type === "tool-call") {
          toolNames.set(ev.id, ev.name);
          if (ev.name === "compile_project") emit("somescript:compiling");
        } else if (ev.type === "tool-result") {
          const name = toolNames.get(ev.id) ?? "";
          if (FILE_CHANGERS.has(name) && ev.ok) {
            changedFiles = true;
            if (FILE_WRITERS.has(name) && typeof ev.result.path === "string") {
              wrotePath = ev.result.path;
            }
            emit("somescript:refresh-workspace");
          }
          if (name === "compile_project") {
            const r = ev.result as { path?: string; pdfPath?: string | null; log?: string };
            emit("somescript:compiled", {
              ok: ev.ok,
              path: r.path ?? "",
              pdfPath: r.pdfPath ?? null,
              // No log means the compile never ran (bad path, no engine): leave the terminal alone.
              log: typeof r.log === "string" ? r.log : null,
            });
          }
        }
      };

      try {
        await flushEditor();
        const stream = await startChat(
          { projectId, messages: history, openFile: openFileRef.current },
          controller.signal,
        );
        for await (const ev of readEvents(stream, controller.signal)) {
          pending.push(ev);
          sideEffects(ev);
          if (!frame) frame = requestAnimationFrame(flush);
        }
      } catch (e) {
        if (!controller.signal.aborted) {
          const message = e instanceof Error ? e.message : String(e);
          pending.push({ type: "error", message });
        }
      } finally {
        if (frame) cancelAnimationFrame(frame);
        flush();
        // Nothing arrived: don't leave an empty bubble. A failure is shown beside the composer.
        const current = messagesRef.current.find((m) => m.id === assistantId);
        if (current?.role === "assistant" && current.parts.length === 0) {
          commit(messagesRef.current.filter((m) => m.id !== assistantId));
          if (current.error) setError(current.error);
        } else {
          patch(settle);
        }
        if (abortRef.current === controller) abortRef.current = null;
        runningRef.current = false;
        setRunning(false);
        persist(messagesRef.current);
        if (changedFiles) emit("somescript:refresh-workspace");
        if (wrotePath) emit("somescript:open-file", wrotePath);
      }
    },
    [commit, persist, projectId],
  );

  const send = useCallback(
    async (text: string, attachments: Attachment[] = []) => {
      const trimmed = text.trim();
      if (runningRef.current || (!trimmed && attachments.length === 0)) return;
      const user: ChatMessage = {
        id: uid(),
        role: "user",
        text: trimmed,
        ...(attachments.length ? { attachments } : {}),
      };
      const history = [...messagesRef.current, user];
      if (messagesRef.current.length === 0)
        titleRef.current(titleFrom(trimmed || attachments[0].name));
      await runTurn(history);
    },
    [runTurn],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const retry = useCallback(async () => {
    if (runningRef.current) return;
    const list = [...messagesRef.current];
    while (list.length > 0 && list[list.length - 1].role === "assistant") list.pop();
    if (list.length === 0) return;
    await runTurn(list);
  }, [runTurn]);

  return {
    messages,
    loading,
    running,
    error,
    send,
    stop,
    retry,
    dismissError: () => setError(null),
  };
}
