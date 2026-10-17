// Pure functions that fold events into chat messages, ensuring rock-solid message ordering.

import type {
  AssistantMessage,
  AssistantPart,
  ChatEvent,
  ChatMessage,
  Todo,
  ToolPart,
  ToolResult,
} from "./types";

/** Appends text to the last part when it is the same kind, so a stream becomes one continuous block. */
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
      return {
        ...msg,
        ...(ev.provider ? { provider: ev.provider } : {}),
        ...(ev.model ? { model: ev.model } : {}),
      };
    case "text":
      return { ...msg, parts: appendTo(msg.parts, "text", ev.delta) };
    case "reasoning":
      return { ...msg, parts: appendTo(msg.parts, "reasoning", ev.delta) };
    case "tool-call": {
      const existing = msg.parts.findIndex((p) => p.type === "tool" && p.id === ev.id);
      const part: ToolPart = {
        type: "tool",
        id: ev.id,
        name: ev.name,
        args: ev.args ?? {},
        ...(typeof ev.step === "number" ? { step: ev.step } : {}),
        ...(ev.inputRequest ? { inputRequest: ev.inputRequest } : {}),
        status: "running",
      };
      if (existing !== -1) {
        const nextParts = [...msg.parts];
        nextParts[existing] = { ...(nextParts[existing] as ToolPart), ...part };
        return { ...msg, parts: nextParts };
      }
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
 * The run is over (finished, failed, or stopped): nothing may stay "running".
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

/** Messages loaded from disk may have been saved mid-run: settle them. */
export function settleAll(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) =>
    m.role === "assistant" && (m.running || m.parts.some(isRunningTool)) ? settle(m) : m,
  );
}

const isRunningTool = (p: AssistantPart) => p.type === "tool" && p.status === "running";

/** Coerces whatever is in a saved file or external history into messages the UI can render. */
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

/** The latest checklist the assistant wrote with `todo` or `todo_write`, if any. */
export function latestTodos(parts: AssistantPart[]): Todo[] | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    if (p.type === "tool" && (p.name === "todo" || p.name === "todo_write") && p.result?.ok) {
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
