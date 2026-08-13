import { defineInstrumentation } from "eve/instrumentation";
import { modeFromMessages, primaryModelFor } from "./model-config";

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
 * Server-side observability for the chat.
 *
 * **No `setup` on purpose.** Local trace recording (`.eve/traces`, readable with
 * `eve traces` / the dev TUI) installs itself only while nothing else has
 * claimed the OTel runtime — `installLocalInstrumentationRuntime` returns early
 * if one exists, and eve's docs say plainly that an authored `setup` "takes
 * over and nothing is recorded locally". Those local traces are not a toy: they
 * are what proved every turn of a 1h45m session ran Lite's model regardless of
 * the picker, and what surfaced `compile-project` executing twice per step.
 * Adding an exporter here would silently delete that capability, so wire one up
 * only when you actually have a backend to send to, and expect to lose local
 * traces the moment you do.
 *
 * `events["step.started"]` needs no `setup` — eve merges the returned
 * runtimeContext into the AI SDK spans either way, so these tags land on the
 * local traces too.
 *
 * `recordInputs`/`recordOutputs` are set explicitly to `true` below. Through
 * eve 0.31 they defaulted to `true` and this file relied on that default; eve
 * 0.35 flipped the default to `false` ("Instrumentation now records trace
 * metadata without model or tool inputs and outputs by default"), which would
 * have silently blinded local traces again on upgrade — the same failure mode
 * as the incident below, from a different cause. Pinning them explicitly
 * survives eve changing its default a second time.
 *
 * The original incident: they were briefly set to `false` here on privacy
 * grounds, which was wrong. It is the AI SDK that writes `ai.prompt.messages`,
 * `ai.prompt.system`, `ai.response.text` and `ai.response.tool_results` onto
 * its spans, and eve's local trace provider only re-projects what it finds
 * there (tracing/agent-otel-provider.js). Turning them off therefore deleted
 * every prompt and reply from `eve traces --verbose` — the one artifact that
 * shows what the model was actually fed and what it actually said.
 *
 * That is safe *only* because there is no `setup` below, so those spans have
 * exactly one destination: the local `.eve/traces` spool on this machine.
 * eve's own switch for that spool is EVE_TRACES_CONTENT
 * (`captureContent: process.env.EVE_TRACES_CONTENT !== "off"`), which stays
 * the runtime kill switch — it also gates agent/hooks/transcript.ts, so
 * setting it to `off` still turns off content capture everywhere even with
 * recordInputs/recordOutputs pinned true below.
 *
 * !! If you ever add a `setup` exporter, revisit this. The spans stop being
 * local-only that day, and full document text starts leaving the machine.
 */
export default defineInstrumentation({
  recordInputs: true,
  recordOutputs: true,
  events: {
    /**
     * Tag every model call with the chat mode it resolved to and the model that
     * implies. This is the check that would have caught the mode bug on day one:
     * the resolver reads the same marker, from the same messages, at the same
     * scope, so a span whose `somescript.mode` is "expert" while the trace
     * header reports deepseek means selection and billing have diverged again.
     */
    "step.started"(input) {
      const mode = modeFromMessages(input.modelInput.messages);
      const projectId = projectIdFromMessages(input.modelInput.messages);
      return {
        runtimeContext: {
          "somescript.mode": mode,
          "somescript.expected_model": primaryModelFor(mode),
          ...(projectId ? { "somescript.project_id": projectId } : {}),
        },
      };
    },
  },
});
