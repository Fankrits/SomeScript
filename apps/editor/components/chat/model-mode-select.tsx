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

/**
 * Model-mode picker for the Eve composer (Lite / Pro / Expert). Sits in the
 * composer toolbar; the choice drives both the model (via a marker read by the
 * agent's dynamic resolver) and whether image attachments are offered.
 */
export function ModelModeSelect() {
  const { mode, setMode } = useModelMode();
  const current = EVE_MODES.find((m) => m.id === mode);

  return (
    <Select
      value={mode}
      onValueChange={(v) => {
        if (isEveMode(v)) setMode(v);
      }}
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
        {EVE_MODES.map((m) => (
          <SelectItem key={m.id} value={m.id} className="items-start">
            <span className="flex flex-col">
              <span className="text-sm font-medium">{m.label}</span>
              <span className="text-xs text-muted-foreground">{m.hint}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
