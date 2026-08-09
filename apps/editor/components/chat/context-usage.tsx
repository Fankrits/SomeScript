"use client";

import React from "react";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextTrigger,
} from "@/components/ai-elements/context";
import { useModelMode } from "@/components/chat/model-mode-context";
import type { EveMode } from "@/lib/eve-modes";

export type ContextUsage = {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/**
 * Live context usage for the composer meter, published by <EveThreadInner /> and
 * read by <ContextIndicator /> down inside <Thread />. Mirrors how
 * ModelModeContext hands the picker its state — the composer is rendered by
 * assistant-ui, so there is no prop path from the runtime hook to it.
 */
const ContextUsageContext = React.createContext<ContextUsage | null>(null);

export const ContextUsageProvider = ContextUsageContext.Provider;

/** Windows are server-resolved from env vars; see app/api/eve/context-window. */
function useContextWindows(): Partial<Record<EveMode, number>> | null {
  const [windows, setWindows] = React.useState<Partial<Record<EveMode, number>> | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/eve/context-window", { signal: controller.signal });
        if (!res.ok) return;
        const data: Partial<Record<EveMode, number>> = await res.json();
        setWindows(data);
      } catch {
        // Cosmetic meter — a failed or aborted fetch just leaves it hidden.
      }
    })();
    return () => controller.abort();
  }, []);

  return windows;
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact" });

/**
 * Composer meter: how full the model's context window is right now.
 *
 * Renders nothing until there is something true to say — no usage reported yet
 * (a fresh thread), or no configured window for the active mode. A 0% ring on
 * an empty chat is noise, and charting against eve's flat 100k fallback would
 * assert a limit that isn't the model's.
 *
 * Only the token-accurate parts of the ai-elements Context are used. Its
 * ContextInputUsage/OutputUsage/CacheUsage components price tokens through
 * tokenlens, which has no entry for any gateway model id configured here and
 * returns an empty costUSD — they would render $0.00 as though it were real.
 */
export function ContextIndicator() {
  const usage = React.useContext(ContextUsageContext);
  const { mode } = useModelMode();
  const windows = useContextWindows();

  const maxTokens = windows?.[mode];
  if (!usage || !maxTokens) return null;

  // Clamp: eve compacts at 90% of the window, but a single turn can overshoot
  // (the call that crosses the trigger is still allowed to finish), and a ring
  // past full reads as a bug.
  const usedTokens = Math.min(usage.inputTokens, maxTokens);

  return (
    <Context maxTokens={maxTokens} usedTokens={usedTokens} usage={undefined}>
      <ContextTrigger
        className="h-7 gap-1.5 rounded-full px-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label={`Context ${compact.format(usage.inputTokens)} of ${compact.format(maxTokens)} tokens used`}
      />
      <ContextContent align="start" side="top">
        <ContextContentHeader />
        <ContextContentBody className="space-y-1.5 text-xs">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Last turn input</span>
            <span className="font-mono">{compact.format(usage.inputTokens)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Last turn output</span>
            <span className="font-mono">{compact.format(usage.outputTokens)}</span>
          </div>
        </ContextContentBody>
      </ContextContent>
    </Context>
  );
}
