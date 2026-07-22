// Single source of truth for the Eve chat's selectable model modes.
// Imported by both the client (composer selector, runtime hook) and the agent's
// dynamic model resolver in agent/agent.ts. Keep it dependency-free so the eve
// build can trace it across the app/agent boundary.

export type EveMode = "lite" | "pro" | "expert";

export const EVE_MODES = [
  {
    id: "lite",
    label: "Lite",
    modelId: "deepseek/deepseek-v4-flash",
    vision: false,
    hint: "Fast & cheap",
  },
  {
    id: "pro",
    label: "Pro",
    modelId: "openai/gpt-5.6-luna",
    vision: true,
    hint: "Balanced",
  },
  {
    id: "expert",
    label: "Expert",
    modelId: "moonshotai/kimi-k3",
    vision: true,
    hint: "Most capable",
  },
] as const satisfies readonly {
  id: EveMode;
  label: string;
  modelId: string;
  vision: boolean;
  hint: string;
}[];

export const DEFAULT_MODE: EveMode = "lite";

export const MODE_MODEL_IDS: Record<EveMode, string> = Object.fromEntries(
  EVE_MODES.map((m) => [m.id, m.modelId]),
) as Record<EveMode, string>;

export function isEveMode(v: unknown): v is EveMode {
  return EVE_MODES.some((m) => m.id === v);
}
