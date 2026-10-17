// What the chat panel keeps in memory and persists per conversation (`/api/eve/thread`).

export interface Attachment {
  name: string;
  text: string;
  type?: "text" | "image" | "file";
  url?: string;
  mediaType?: string;
}

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
  attachments?: Attachment[];
}

/** What a tool call returned for the screen: always has `ok`; the rest depends on the tool. */
export interface ToolResult {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

export type ToolStatus = "running" | "done" | "error" | "stopped";

export interface ToolPart {
  type: "tool";
  id: string;
  name: string;
  args: Record<string, unknown>;
  /** Which model step issued it: calls from different steps are replayed as separate steps. */
  step?: number;
  status: ToolStatus;
  /** The short text the model saw as the tool's result; sent back as history on later turns. */
  output?: string;
  result?: ToolResult;
  error?: string;
  /** Human-in-the-loop input request details (for ask_question or approval confirmation). */
  inputRequest?: {
    requestId: string;
    prompt?: string;
    display?: string;
    options?: Array<{ id: string; label: string; style?: string }>;
  };
}

export type AssistantPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string }
  | { type: "notice"; text: string }
  | ToolPart;

export interface AssistantMessage {
  id: string;
  role: "assistant";
  parts: AssistantPart[];
  /** True while the reply is still arriving. Never persisted as true: see `settle`. */
  running?: boolean;
  /** Set when the turn failed; the message keeps whatever arrived before the failure. */
  error?: string;
  provider?: string;
  model?: string;
}

export type ChatMessage = UserMessage | AssistantMessage;

export type ChatEvent =
  | { type: "start"; provider?: string; model?: string }
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | {
      type: "tool-call";
      id: string;
      name: string;
      args: Record<string, unknown>;
      step?: number;
      inputRequest?: ToolPart["inputRequest"];
    }
  | { type: "tool-result"; id: string; ok: boolean; result: ToolResult; output: string }
  | { type: "usage"; input: number; output: number; costUsd?: number }
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "done"; reason?: string };

export interface Todo {
  content: string;
  status: "pending" | "in_progress" | "completed";
}
