"use client";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { GROUPS, LATEX_SYMBOLS } from "./toolbar-config";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInsert: (text: string, cursorOffset?: number) => void;
}

/**
 * ⌘K palette: searchable index of every toolbar command plus the LaTeX symbol
 * table — the scalable home for the long tail a fixed toolbar can't hold. Runs
 * insertion through the same onInsert (wrapInsert) path as the toolbar buttons.
 */
export function CommandPalette({ open, onOpenChange, onInsert }: CommandPaletteProps) {
  const run = (text: string, cursorOffset?: number) => {
    onInsert(text, cursorOffset);
    onOpenChange(false);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Insert LaTeX"
      description="Search commands and symbols"
    >
      <Command>
        <CommandInput placeholder="Search commands and symbols…" />
        <CommandList>
          <CommandEmpty>No matching command.</CommandEmpty>

          {GROUPS.map((group) => (
            <CommandGroup key={group.id} heading={group.title}>
              {[...(group.primary ?? []), ...(group.menu ?? [])].map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`${group.id}:${item.label}`}
                    value={`${item.label} ${item.text}`}
                    onSelect={() => run(item.text, item.cursorOffset)}
                  >
                    {Icon ? <Icon className="size-3.5" /> : <span className="size-3.5" />}
                    <span>{item.label}</span>
                    {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))}

          <CommandGroup heading="Symbols">
            {LATEX_SYMBOLS.map((sym) => (
              <CommandItem
                key={sym.text}
                value={`${sym.label} ${sym.text} ${sym.keywords ?? ""}`}
                onSelect={() => run(sym.text, sym.cursorOffset ?? 0)}
              >
                <span className="w-5 text-center font-mono text-base leading-none">
                  {sym.preview}
                </span>
                <span>{sym.label}</span>
                <CommandShortcut className="font-mono">{sym.text}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
