import { defineAgent, defineDynamic } from "eve";
import { DEFAULT_MODE, isEveMode, type EveMode } from "../lib/eve-modes";
import { primaryModelFor, fallbackModelsFor } from "./model-config";

// The client injects a "[mode: lite|pro|expert]" marker into each user message
// (see onNew in hooks/use-eve-runtime.ts), mirroring the existing "[projectId: …]"
// marker. The resolver reads the most recent user message to pick the mode, so
// switching modes mid-conversation takes effect on the next turn.
const MODE_RE = /\[mode:\s*(lite|pro|expert)\]/i;

function modeFromMessages(
  messages: readonly { role: string; content: unknown }[],
): EveMode {
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

export default defineAgent({
  model: defineDynamic({
    fallback: primaryModelFor(DEFAULT_MODE),
    events: {
      "turn.started": (_event, ctx) => {
        const mode = modeFromMessages(ctx.messages);
        const fallbackModels = fallbackModelsFor(mode);
        if (fallbackModels.length === 0) return primaryModelFor(mode);
        // Extra LITE_MODEL/PRO_MODEL/EXPERT_MODEL entries beyond the first
        // become fallback models the AI Gateway retries in order if the
        // primary model call fails.
        return {
          model: primaryModelFor(mode),
          modelOptions: { providerOptions: { gateway: { models: fallbackModels } } },
        };
      },
    },
  }),
});
