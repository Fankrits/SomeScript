import { defineAgent, defineDynamic } from "eve";
import { MODE_MODEL_IDS, DEFAULT_MODE, isEveMode } from "../lib/eve-modes";

// The client injects a "[mode: lite|pro|expert]" marker into each user message
// (see onNew in hooks/use-eve-runtime.ts), mirroring the existing "[projectId: …]"
// marker. The resolver reads the most recent user message to pick the model, so
// switching modes mid-conversation takes effect on the next turn.
const MODE_RE = /\[mode:\s*(lite|pro|expert)\]/i;

function modeModelFromMessages(
  messages: readonly { role: string; content: unknown }[],
): string {
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
    if (isEveMode(mode)) return MODE_MODEL_IDS[mode];
  }
  return MODE_MODEL_IDS[DEFAULT_MODE];
}

export default defineAgent({
  model: defineDynamic({
    fallback: MODE_MODEL_IDS[DEFAULT_MODE],
    events: {
      "turn.started": (_event, ctx) => modeModelFromMessages(ctx.messages),
    },
  }),
});
