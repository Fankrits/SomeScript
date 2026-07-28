"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EVE_MODES, isEveMode } from "@/lib/eve-modes";
import { useModelMode } from "@/components/chat/model-mode-context";
import { useCreditStatus } from "@/hooks/use-credit-status";
import { useAuiState } from "@assistant-ui/react";

/**
 * Model-mode picker for the Eve composer (Lite / Pro / Expert). Sits in the
 * composer toolbar; the choice drives both the model (via a marker read by the
 * agent's dynamic resolver) and whether image attachments are offered.
 *
 * Locking here is a UX nicety, not the enforcement boundary — the real gate is
 * the pre-flight check in use-eve-runtime.ts's onNew and the server-side credits
 * API. `allowedModes` is null while loading, which is treated as "don't restrict
 * yet" so the picker doesn't flash every option locked before the fetch resolves.
 */
export function ModelModeSelect() {
  const { mode, setMode } = useModelMode();
  const current = EVE_MODES.find((m) => m.id === mode);
  const credits = useCreditStatus();
  // eve-thread.tsx remounts the whole runtime (key={mode}) on a mode switch to
  // pick up the new attachment adapter — fine between turns, but mid-stream it
  // would tear down the in-flight turn's live updates. Disabling here is
  // simpler and safer than trying to make the remount survive an active turn.
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <Select
      value={mode}
      onValueChange={(v) => {
        if (isEveMode(v)) setMode(v);
      }}
      disabled={isRunning}
    >
      <SelectTrigger
        size="sm"
        aria-label="Model mode"
        className="h-7 gap-1 rounded-full border-none bg-transparent px-2.5 text-xs font-medium text-muted-foreground shadow-none hover:bg-accent hover:text-foreground focus-visible:ring-0"
      >
        {/* Explicit children so the trigger shows only the mode name — Select's
            default behavior mirrors the full selected SelectItem content
            (label + hint), which is too much for the toolbar button. */}
        <SelectValue>{current?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {EVE_MODES.map((m) => {
          const locked = credits !== null && !credits.allowedModes.includes(m.id);
          return (
            <SelectItem key={m.id} value={m.id} disabled={locked} className="items-start">
              <span className="flex flex-col">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">
                  {locked ? "Upgrade to unlock" : m.hint}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
