import { DEFAULT_MODE, isEveMode, type EveMode } from "../lib/eve-modes";

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

/**
 * Context window per mode, same env-var-first pattern as the model ids above.
 *
 *   PRO_CONTEXT_WINDOW=400000
 *
 * This is not cosmetic. eve's dynamic model resolver never inherits the
 * window from the compiled fallback (docs/agent-config.md: "Set
 * `modelContextWindowTokens` when the selected model's window differs from the
 * fallback's — it is never inherited"), and when it is unset eve falls back to
 * a flat 100k trigger:
 *
 *   threshold: contextWindowTokens === undefined ? 1e5 : floor(window * 0.9)
 *   — eve/dist/src/execution/session.js, createCompactionConfig
 *
 * So an unset mode compacts at ~100k however big its real window is: too early
 * on a large-window model (long threads "forget" for no reason), or too late on
 * one under ~111k (the turn overflows before compaction ever fires).
 *
 * Deliberately no built-in defaults: a wrong number here is worse than none,
 * because too large overflows the model at request time. Look each model's real
 * window up in the AI Gateway model catalog and set the env var. Unset keeps
 * today's behaviour (the flat 100k) rather than guessing.
 *
 * The value must be the MINIMUM across the mode's primary model *and* every
 * gateway fallback in its `*_MODEL` list, not the primary's own window. The
 * gateway silently retries a failed call against the next id, so the request
 * has to fit whichever one ends up serving it. LITE is the live example:
 * deepseek-v4-flash holds 1,000,000 but its gpt-4o-mini fallback holds 128,000,
 * so LITE_CONTEXT_WINDOW is 128000. Re-derive it whenever a fallback list
 * changes:
 *
 *   curl -s https://ai-gateway.vercel.sh/v1/models \
 *     -H "Authorization: Bearer $AI_GATEWAY_API_KEY" \
 *     | jq '.data[] | select(.id=="<model-id>") | {id, context_window}'
 */
const CONTEXT_WINDOW_ENV_VAR: Record<EveMode, string> = {
  lite: "LITE_CONTEXT_WINDOW",
  pro: "PRO_CONTEXT_WINDOW",
  expert: "EXPERT_CONTEXT_WINDOW",
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

/**
 * Context window for a mode, or undefined when unconfigured — see
 * CONTEXT_WINDOW_ENV_VAR. Undefined is returned rather than a guess, and the
 * caller omits the field entirely so eve keeps its own fallback.
 *
 * Anything not a positive integer is dropped: eve's validateDynamicModelSelection
 * throws on those, and a throwing resolver silently leaves the whole model
 * scope unset ("Failures degrade, never fail the turn"), which would cost the
 * mode's model selection too, not just its window.
 */
export function contextWindowFor(mode: EveMode): number | undefined {
  const raw = process.env[CONTEXT_WINDOW_ENV_VAR[mode]];
  if (!raw) return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    console.error(
      `${CONTEXT_WINDOW_ENV_VAR[mode]} must be a positive integer, got "${raw}" — ignoring.`,
    );
    return undefined;
  }
  return parsed;
}

// The client injects a "[mode: lite|pro|expert]" marker into each user message
// (see onNew in hooks/use-eve-runtime.ts), mirroring the existing "[projectId: …]"
// marker. The resolver reads the most recent user message to pick the mode.
//
// This MUST be resolved on `step.started`, not `turn.started`. eve only hands a
// resolver the conversation when the emitter passes it: `emitStepStarted(j, S, z)`
// forwards the assembled messages, but `emitTurnPreamble` calls the emitter with
// no messages argument at all, and workflow-steps.js then dispatches with
// `messages: t ?? []`. A `turn.started` resolver therefore always sees `[]`, so
// this function fell through to DEFAULT_MODE ("lite") on every single turn —
// Pro and Expert silently ran Lite's model while the client-reported mode was
// still billed. `step.started` is also the only scope where the *current* turn's
// user message is present, so a mode switch now applies to the message that
// carried it rather than the one after.
//
// (Verified against eve 0.31.3: harness/emission.js, harness/tool-loop.js,
// execution/workflow-steps.js. eve's own docs example resolves from
// `ctx.session.auth`, never from `ctx.messages`, which is why this gap exists.)
const MODE_RE = /\[mode:\s*(lite|pro|expert)\]/i;

export function modeFromMessages(messages: readonly { role: string; content: unknown }[]): EveMode {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const text =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content
              .map((p: unknown) =>
                p && typeof p === "object" && (p as { type?: string }).type === "text"
                  ? ((p as { text?: string }).text ?? "")
                  : "",
              )
              .join("")
          : "";
    const hit = MODE_RE.exec(text);
    const mode = hit?.[1].toLowerCase();
    if (isEveMode(mode)) return mode;
  }
  return DEFAULT_MODE;
}
