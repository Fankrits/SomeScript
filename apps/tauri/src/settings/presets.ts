import type { ProviderKind } from "../chat/api";

/**
 * Starting points for the "Add provider" form. Only the name, protocol and base URL matter: the
 * model lists are suggestions (the form can fetch the live list from the provider), and any
 * OpenAI-compatible server works as a "Custom endpoint".
 */
export interface Preset {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Where to create a key, shown as a link in the form. */
  keyUrl?: string;
  needsKey: boolean;
  models: string[];
  hint?: string;
}

export const PRESETS: Preset[] = [
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    keyUrl: "https://platform.openai.com/api-keys",
    needsKey: true,
    models: ["gpt-4.1", "gpt-4.1-mini", "o4-mini"],
  },
  {
    id: "anthropic",
    name: "Anthropic",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    keyUrl: "https://console.anthropic.com/settings/keys",
    needsKey: true,
    models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    keyUrl: "https://openrouter.ai/keys",
    needsKey: true,
    models: ["anthropic/claude-sonnet-4.5", "openai/gpt-4.1", "google/gemini-2.5-pro"],
    hint: "One key for hundreds of models from many labs.",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyUrl: "https://aistudio.google.com/apikey",
    needsKey: true,
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    hint: "Uses Google's OpenAI-compatible endpoint.",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    keyUrl: "https://console.groq.com/keys",
    needsKey: true,
    models: ["llama-3.3-70b-versatile"],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    keyUrl: "https://platform.deepseek.com/api_keys",
    needsKey: true,
    models: ["deepseek-chat"],
  },
  {
    id: "ollama",
    name: "Ollama (local)",
    kind: "openai",
    baseUrl: "http://localhost:11434/v1",
    needsKey: false,
    models: [],
    hint: "Runs on this computer, no key. Pick a model you've pulled that can use tools, e.g. qwen2.5-coder. Give Ollama a context window of 16k or more (OLLAMA_CONTEXT_LENGTH=16384): its default is too small for the assistant's tools.",
  },
  {
    id: "lmstudio",
    name: "LM Studio (local)",
    kind: "openai",
    baseUrl: "http://localhost:1234/v1",
    needsKey: false,
    models: [],
    hint: "Start the local server in LM Studio first, and load the model with a Context Length of 16384 or more: the default is too small for the assistant's tools.",
  },
  {
    id: "custom",
    name: "Custom endpoint",
    kind: "openai",
    baseUrl: "",
    needsKey: false,
    models: [],
    hint: "Any server that speaks the OpenAI API: LiteLLM, vLLM, Azure, a company gateway…",
  },
];

export const presetById = (id: string) => PRESETS.find((p) => p.id === id);

/** The preset a saved provider most resembles (by base URL), for the key link and the hint. */
export function presetFor(baseUrl: string): Preset | undefined {
  const normalized = baseUrl.replace(/\/+$/, "");
  return PRESETS.find((p) => p.baseUrl && p.baseUrl === normalized);
}
