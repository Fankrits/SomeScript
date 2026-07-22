// Single source of truth for the Eve chat's selectable model modes — UI
// metadata only (client-safe). Imported by the composer selector and the
// runtime hook. The actual backing model ids come from env vars, read
// server-only in agent/model-config.ts, so they never end up evaluated in
// the client bundle.

export type EveMode = "lite" | "pro" | "expert";

export const EVE_MODES = [
  { id: "lite", label: "Lite", vision: false, hint: "Fast & cheap" },
  { id: "pro", label: "Pro", vision: true, hint: "Balanced" },
  { id: "expert", label: "Expert", vision: true, hint: "Most capable" },
] as const satisfies readonly {
  id: EveMode;
  label: string;
  vision: boolean;
  hint: string;
}[];

export const DEFAULT_MODE: EveMode = "lite";

export function isEveMode(v: unknown): v is EveMode {
  return EVE_MODES.some((m) => m.id === v);
}
