"use client";

import { useMemo, useState } from "react";
import {
  Terminal,
  TerminalHeader,
  TerminalTitle,
  TerminalStatus,
  TerminalActions,
  TerminalCopyButton,
  TerminalClearButton,
  TerminalContent,
} from "@/components/ai-elements/terminal";
import { parseCompileErrors } from "@/lib/compile-errors";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  SquareTerminalIcon,
  LayoutListIcon,
  FileCodeIcon,
  ArrowRightIcon,
  SparklesIcon,
  CheckCircle2Icon,
} from "lucide-react";

export interface TerminalLogViewerProps {
  output: string;
  isStreaming?: boolean;
  compilePath: string;
  onSelectError?: (file: string, line: number) => void;
  onSendToChat?: (text?: string) => void;
  onClear?: () => void;
  className?: string;
}

export function TerminalLogViewer({
  output,
  isStreaming = false,
  compilePath,
  onSelectError,
  onSendToChat,
  onClear,
  className,
}: TerminalLogViewerProps) {
  const [mode, setMode] = useState<"raw" | "cards">("cards");

  const errors = useMemo(() => parseCompileErrors(output, compilePath), [output, compilePath]);

  return (
    <Terminal
      output={output}
      isStreaming={isStreaming}
      onClear={onClear}
      className={cn("flex flex-col h-full overflow-hidden", className)}
    >
      <TerminalHeader className="shrink-0">
        <div className="flex items-center gap-3">
          <TerminalTitle />
          {/* View mode switcher */}
          <div className="flex items-center rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
            <button
              type="button"
              onClick={() => setMode("raw")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                mode === "raw"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <SquareTerminalIcon className="size-3.5" />
              <span>Raw</span>
            </button>
            <button
              type="button"
              onClick={() => setMode("cards")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                mode === "cards"
                  ? "bg-zinc-800 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <LayoutListIcon className="size-3.5" />
              <span>Cards</span>
              {errors.length > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-0.5 h-4 px-1.5 text-[10px] font-semibold"
                >
                  {errors.length}
                </Badge>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TerminalStatus />
          {output && onSendToChat && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onSendToChat()}
              title="Send terminal output to chat"
              className="h-7 px-2.5 text-xs font-medium gap-1.5 border-zinc-700 bg-zinc-800/80 text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
            >
              <SparklesIcon className="size-3.5 text-amber-400" />
              <span>Send to chat</span>
            </Button>
          )}
          <TerminalActions>
            <TerminalCopyButton />
            {onClear && <TerminalClearButton />}
          </TerminalActions>
        </div>
      </TerminalHeader>

      {mode === "raw" ? (
        <TerminalContent className="max-h-none flex-1 overflow-auto text-xs" />
      ) : (
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {errors.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[160px] p-6 text-center text-zinc-400">
              <CheckCircle2Icon className="size-8 text-emerald-500 mb-2" />
              <p className="text-sm font-medium text-zinc-200">No compilation errors</p>
              <p className="text-xs text-zinc-500 mt-1">
                Your LaTeX document compiled cleanly without errors.
              </p>
            </div>
          ) : (
            errors.map((err, idx) => (
              <div
                key={`${err.file}-${err.line}-${idx}`}
                className="group flex flex-col rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-2.5 transition-colors hover:border-zinc-700"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onSelectError?.(err.file, err.line)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-xs font-mono text-rose-400 hover:bg-rose-500/20 transition-colors"
                  >
                    <FileCodeIcon className="size-3.5" />
                    <span>
                      {err.file}:{err.line}
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5 ml-auto">
                    {onSelectError && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectError(err.file, err.line)}
                        className="h-7 text-xs gap-1.5 border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                      >
                        <ArrowRightIcon className="size-3.5" />
                        <span>Jump to line</span>
                      </Button>
                    )}
                    {onSendToChat && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          onSendToChat(
                            `I got a compilation error in ${err.file} at line ${err.line}:\n\n${err.message}\n\nHow do I fix this?`,
                          )
                        }
                        className="h-7 text-xs gap-1.5 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 border border-violet-500/30 hover:text-violet-100"
                      >
                        <SparklesIcon className="size-3.5 text-violet-400" />
                        <span>Ask AI</span>
                      </Button>
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-zinc-800/80 bg-zinc-950/80 p-2.5 font-mono text-xs text-rose-300/90 whitespace-pre-wrap break-words leading-relaxed">
                  {err.message}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Terminal>
  );
}
