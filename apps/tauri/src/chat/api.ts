// Client for the AI routes in src-tauri/src/api/ai.rs. API keys only ever travel from the
// Settings form to the server; nothing here can read one back.

import type { ChatMessage } from "./types";

export type ProviderKind = "openai" | "anthropic";

/** A provider as the UI sees it: the key itself is never included, only whether one is saved. */
export interface Provider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  hasKey: boolean;
  keyHint: string;
  apiKeyHeader: string;
  models: string[];
  defaultModel: string;
}

export interface AiSettings {
  providers: Provider[];
  activeProviderId: string | null;
  activeModel: string | null;
  customInstructions: string;
}

/** The Settings form. `apiKey` undefined keeps the saved key; `clearKey` removes it. */
export interface ProviderForm {
  id?: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  clearKey?: boolean;
  apiKeyHeader?: string;
  models?: string[];
  defaultModel?: string;
}

export type TestResult =
  | { ok: true; models?: string[]; sample?: string; ms?: number }
  | { ok: false; error: string };

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`);
  return body as T;
}

const post = <T>(url: string, body: unknown) =>
  call<T>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export const getAiSettings = () => call<AiSettings>("/api/ai/settings");

export const saveProvider = (form: ProviderForm) =>
  post<{ provider: Provider; settings: AiSettings }>("/api/ai/providers", form);

export const deleteProvider = (id: string) => post<AiSettings>("/api/ai/providers/delete", { id });

/** `activeProviderId`, `activeModel`, `customInstructions`: send only what changes. */
export const setAiPreferences = (
  patch: Partial<Pick<AiSettings, "activeProviderId" | "activeModel" | "customInstructions">>,
) => post<AiSettings>("/api/ai/settings", patch);

/** `models` lists what the endpoint offers; `chat` makes one real round trip with `model`. */
export const testProvider = (form: ProviderForm, mode: "models" | "chat", model?: string) =>
  post<TestResult>("/api/ai/providers/test", { ...form, mode, model });

export interface ChatRequest {
  projectId: string;
  messages: ChatMessage[];
  openFile?: string | null;
  providerId?: string | null;
  model?: string | null;
}

/** Starts a turn. A non-2xx answer (no provider, bad project) throws with the server's message. */
export async function startChat(
  req: ChatRequest,
  signal: AbortSignal,
): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.body;
}

// ---- where the app goes to configure AI -----------------------------------------------------

/** The Settings screen, remembering where to return to (the editor of the open project). */
export function settingsUrl(section: "ai" | "general" = "ai"): string {
  const here = `${window.location.pathname}${window.location.search}`;
  const from = window.location.pathname.startsWith("/settings")
    ? ""
    : `&from=${encodeURIComponent(here)}`;
  return `/settings?section=${section}${from}`;
}
