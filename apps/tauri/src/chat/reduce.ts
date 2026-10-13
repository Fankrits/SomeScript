// Pure functions that fold the server's event stream into chat messages, so the streaming
// behaviour can be tested without a DOM or a network.

import type {
  AssistantMessage,
  AssistantPart,
  ChatEvent,
  ChatMessage,
  Todo,
  ToolPart,
  ToolResult,
} from "./types";

/** Appends text to the last part when it is the same kind, so a stream becomes one paragraph. */
function appendTo(
  parts: AssistantPart[],
  type: "text" | "reasoning",
  delta: string,
): AssistantPart[] {
  const last = parts[parts.length - 1];
  if (last && last.type === type) {
    return [...parts.slice(0, -1), { type, text: last.text + delta }];
  }
  return [...parts, { type, text: delta }];
}

export function applyEvent(msg: AssistantMessage, ev: ChatEvent): AssistantMessage {
  switch (ev.type) {
    case "start":
      return { ...msg, provider: ev.provider, model: ev.model };
    case "text":
      return { ...msg, parts: appendTo(msg.parts, "text", ev.delta) };
    case "reasoning":
      return { ...msg, parts: appendTo(msg.parts, "reasoning", ev.delta) };
    case "tool-call": {
      const part: ToolPart = {
        type: "tool",
        id: ev.id,
        name: ev.name,
        args: ev.args ?? {},
        status: "running",
      };
      return { ...msg, parts: [...msg.parts, part] };
    }
    case "tool-result":
      return {
        ...msg,
        parts: msg.parts.map((p) =>
          p.type === "tool" && p.id === ev.id
            ? {
                ...p,
                status: ev.ok ? "done" : "error",
                output: ev.output,
                result: ev.result,
              }
            : p,
        ),
      };
    case "notice":
      return { ...msg, parts: [...msg.parts, { type: "notice", text: ev.message }] };
    case "error":
      return { ...msg, error: ev.message };
    case "usage":
    case "done":
      return msg;
  }
}

/**
 * The run is over (finished, failed, or stopped): nothing may stay "running". A tool that never
 * reported back (the user pressed Stop mid-call) is marked stopped; the server gives such a call
 * a stand-in result when it rebuilds history, so the conversation can continue.
 */
export function settle(msg: AssistantMessage): AssistantMessage {
  return {
    ...msg,
    running: false,
    parts: msg.parts.map((p) =>
      p.type === "tool" && p.status === "running" ? { ...p, status: "stopped" } : p,
    ),
  };
}

/** Messages loaded from disk may have been saved mid-run (the app was closed): settle them. */
export function settleAll(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.role === "assistant" && (m.running || m.parts.some(isRunningTool)) ? settle(m) : m,
  );
}

const isRunningTool = (p: AssistantPart) => p.type === "tool" && p.status === "running";

/** Coerces whatever is in a saved file into messages the UI can render. */
export function sanitizeMessages(input: unknown): ChatMessage[] {
  if (!Array.isArray(input)) return [];
  const out: ChatMessage[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === "string" && m.id ? m.id : crypto.randomUUID();
    if (m.role === "user" && typeof m.text === "string") {
      const attachments = Array.isArray(m.attachments)
        ? m.attachments.filter(
            (a): a is { name: string; text: string } =>
              typeof a === "object" &&
              a !== null &&
              typeof (a as { name?: unknown }).name === "string" &&
              typeof (a as { text?: unknown }).text === "string",
          )
        : undefined;
      out.push({ id, role: "user", text: m.text, ...(attachments?.length ? { attachments } : {}) });
    } else if (m.role === "assistant" && Array.isArray(m.parts)) {
      const parts = (m.parts as unknown[]).filter(
        (p): p is AssistantPart =>
          typeof p === "object" &&
          p !== null &&
          ["text", "reasoning", "notice", "tool"].includes((p as { type?: string }).type ?? ""),
      );
      out.push({
        id,
        role: "assistant",
        parts,
        ...(typeof m.error === "string" ? { error: m.error } : {}),
        ...(typeof m.provider === "string" ? { provider: m.provider } : {}),
        ...(typeof m.model === "string" ? { model: m.model } : {}),
      });
    }
  }
  return settleAll(out);
}

/** The latest checklist the assistant wrote with `todo_write`, if any. */
export function latestTodos(parts: AssistantPart[]): Todo[] | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.type === "tool" && p.name === "todo_write" && p.result?.ok) {
      const todos = (p.result as ToolResult & { todos?: Todo[] }).todos;
      if (Array.isArray(todos)) return todos;
    }
  }
  return null;
}

/** A short conversation title from the first thing the user asked. */
export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > 48 ? `${line.slice(0, 47).trimEnd()}…` : line || "New Chat";
}
