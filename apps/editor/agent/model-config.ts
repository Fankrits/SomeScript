import type { EveMode } from "../lib/eve-modes";

/**
 * Backing models for each chat mode, configured via env vars so they can
 * change without a code deploy. Each var is a comma-separated list: the first
 * model is primary, the rest are fallbacks the AI Gateway tries in order if
 * the primary model call fails (`providerOptions.gateway.models` — see
 * https://vercel.com/ai-gateway/models). Falls back to a built-in default
 * list when the env var is unset.
 *
 *   LITE_MODEL=deepseek/deepseek-v4-flash,openai/gpt-4o-mini
 *
 * Server-only: read only by agent/agent.ts, never imported by client code.
 */
const ENV_VAR: Record<EveMode, string> = {
  lite: "LITE_MODEL",
  pro: "PRO_MODEL",
  expert: "EXPERT_MODEL",
};

const BUILTIN_DEFAULTS: Record<EveMode, string> = {
  lite: "deepseek/deepseek-v4-flash",
  pro: "openai/gpt-5.6-luna",
  expert: "moonshotai/kimi-k3",
};

function modelsFor(mode: EveMode): string[] {
  const raw = process.env[ENV_VAR[mode]];
  const list = (raw ?? BUILTIN_DEFAULTS[mode])
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [BUILTIN_DEFAULTS[mode]];
}

export function primaryModelFor(mode: EveMode): string {
  return modelsFor(mode)[0];
}

export function fallbackModelsFor(mode: EveMode): string[] {
  return modelsFor(mode).slice(1);
}
