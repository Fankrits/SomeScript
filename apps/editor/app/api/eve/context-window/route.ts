import { EVE_MODES, type EveMode } from "@/lib/eve-modes";
import { contextWindowFor } from "@/agent/model-config";

/**
 * Context window per chat mode, for the composer's usage meter.
 *
 * These live in server-only env vars (see agent/model-config.ts) so they can be
 * retuned without a deploy, which also keeps them out of the client bundle —
 * hence a route rather than a NEXT_PUBLIC_ mirror that would drift from the
 * value the agent actually resolves with. Not secret, just server-resolved.
 *
 * A mode with no configured window is omitted, and the meter hides itself for
 * it, rather than charting a percentage against eve's flat 100k fallback and
 * implying a limit that isn't the model's.
 */
export function GET() {
  const windows: Partial<Record<EveMode, number>> = {};
  for (const { id } of EVE_MODES) {
    const tokens = contextWindowFor(id);
    if (tokens !== undefined) windows[id] = tokens;
  }
  return Response.json(windows);
}
