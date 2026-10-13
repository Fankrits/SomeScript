import { otel } from "eve/instrumentation/otel";

/**
 * Process-wide trace capture policy for eve's OpenTelemetry pipeline.
 *
 * **No exporter on purpose.** Local trace recording (`.eve/traces`, readable with
 * `eve traces` / the dev TUI) is eve's default destination. Those local traces
 * are not a toy: they are what proved every turn of a 1h45m session ran Lite's
 * model regardless of the picker, and what surfaced `compile-project` executing
 * twice per step. Adding an `otelIntegration({ traceExporter })` file here would
 * send spans to a hosted backend, so wire one up only when you actually have a
 * backend to send to — and give it its own `exportPolicy`, because the content
 * capture below is a ceiling shared by every destination.
 *
 * `recordInputs`/`recordOutputs` are pinned to `true` explicitly rather than
 * left to eve's default. The default has already flipped once (eve 0.35 made it
 * metadata-only, which silently blinded local traces on upgrade) and is now
 * audience- and environment-dependent. Pinning survives eve changing it again.
 *
 * The original incident: they were briefly `false` here on privacy grounds,
 * which was wrong. The AI SDK writes `ai.prompt.messages`, `ai.prompt.system`,
 * `ai.response.text` and `ai.response.tool_results` onto its spans, and eve's
 * local trace provider only re-projects what it finds there. Turning them off
 * deleted every prompt and reply from `eve traces --verbose` — the one artifact
 * that shows what the model was actually fed and what it actually said.
 *
 * eve's own runtime kill switch is EVE_TRACES_CONTENT (`off` disables content
 * capture for the local spool); it also gates agent/hooks/transcript.ts.
 *
 * !! If you ever add an exporter, revisit this. The spans stop being local-only
 * that day, and full document text starts leaving the machine.
 */
export default otel({
  tracePolicy: () => ({
    emit: true,
    recordInputs: true,
    recordOutputs: true,
  }),
});
