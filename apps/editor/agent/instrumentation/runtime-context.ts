import { otelIntegration } from "eve/instrumentation/otel";
import { modeFromMessages, primaryModelFor } from "../model-config";

/** Same `[projectId: …]` marker onNew injects; see hooks/use-eve-runtime.ts. */
const PROJECT_ID_RE = /\[projectId:\s*([^\]]+)\]/i;

function projectIdFromMessages(messages: readonly { role: string; content: unknown }[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "user") continue;
    const text = typeof message.content === "string" ? message.content : "";
    const hit = PROJECT_ID_RE.exec(text);
    if (hit) return hit[1].trim();
  }
  return undefined;
}

/**
 * Tags every model call with the chat mode it resolved to and the model that
 * implies. This is the check that would have caught the mode bug on day one:
 * the resolver reads the same marker, from the same messages, at the same
 * scope, so a span whose `somescript.mode` is "expert" while the trace header
 * reports deepseek means selection and billing have diverged again.
 *
 * eve merges the returned object into the AI SDK spans for each model attempt.
 * This file declares no exporter, so the tags land on the local `.eve/traces`
 * spool (eve's default destination) and on nothing else.
 */
export default otelIntegration({
  runtimeContext(input) {
    const mode = modeFromMessages(input.modelInput.messages);
    const projectId = projectIdFromMessages(input.modelInput.messages);
    return {
      "somescript.mode": mode,
      "somescript.expected_model": primaryModelFor(mode),
      ...(projectId ? { "somescript.project_id": projectId } : {}),
    };
  },
});
