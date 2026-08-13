import { defineAgent, defineDynamic } from "eve";
import {
  primaryModelFor,
  fallbackModelsFor,
  contextWindowFor,
  modeFromMessages,
} from "./model-config";

export default defineAgent({
  // Backstop for a model that degenerates into a repetition loop (seen on Lite,
  // which is a small fast model — see agent/model-config.ts). eve checks this
  // before each model call, so it does NOT truncate the runaway generation that
  // crosses it; it stops the session from spending the next one, and the ones
  // after that. Capping a single call isn't authorable in eve 0.31 —
  // `modelOptions` only carries `providerOptions`.
  // ponytail: session-wide cap only; revisit if eve exposes a per-call
  // maxOutputTokens, which is what would actually cut a loop short.
  limits: { maxOutputTokensPerSession: 2_000_000 },
  model: defineDynamic({
    // eve 0.33+ dropped the compiled `fallback` for dynamic models entirely —
    // `defineDynamic` for `model` now accepts only `events`, and every
    // matching handler must return a concrete selection (a missing one fails
    // the turn before model-dependent work begins). That's already true here:
    // "step.started" always fires before the first model call, so there's no
    // gap a fallback would have covered.
    events: {
      // Fires once per model step. The resolver is a regex over messages, so
      // re-running it per step is cheap, and it returns the same mode for every
      // step of a turn — no mid-turn model switch, so no prompt-cache churn
      // beyond an actual user-initiated mode change.
      "step.started": (_event, ctx) => {
        const mode = modeFromMessages(ctx.messages);
        const fallbackModels = fallbackModelsFor(mode);
        // A dynamic selection never inherits the compiled fallback's context
        // window, so compaction runs on a flat 100k trigger unless this mode's
        // window is passed explicitly. See contextWindowFor in model-config.ts.
        const contextWindowTokens = contextWindowFor(mode);
        if (fallbackModels.length === 0 && contextWindowTokens === undefined) {
          return primaryModelFor(mode);
        }
        return {
          model: primaryModelFor(mode),
          ...(contextWindowTokens === undefined
            ? {}
            : { modelContextWindowTokens: contextWindowTokens }),
          // Extra LITE_MODEL/PRO_MODEL/EXPERT_MODEL entries beyond the first
          // become fallback models the AI Gateway retries in order if the
          // primary model call fails. Omitting modelOptions entirely reuses the
          // agent-level value, which is what we want when there are none.
          ...(fallbackModels.length === 0
            ? {}
            : { modelOptions: { providerOptions: { gateway: { models: fallbackModels } } } }),
        };
      },
    },
  }),
});
