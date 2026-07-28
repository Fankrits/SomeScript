# Terminal Error Cards & Log Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the terminal UI by adding a toggle button that switches between raw terminal output and a structured error card view for quick diagnostics.

**Architecture:** Create a `TerminalLogViewer` component in `apps/editor/components/editor/terminal-log-viewer.tsx` that wraps the base `<Terminal>` primitive. Integrate the parsed `CompileError[]` from `parseCompileErrors()` into a visual cards view with "Jump to Code" and "Ask Eve AI" action triggers, and replace direct `<Terminal>` usage in `apps/editor/app/page.tsx`.

**Tech Stack:** Next.js 16 (React 19), Tailwind CSS, Lucide icons, CodeMirror linting/diagnostics, `@/components/ai-elements/terminal`.

## Global Constraints
- Next.js 16 file conventions & type safety using `bun x tsc --noEmit`.
- Accessible & modern dark-mode aesthetic consistent with `apps/editor/components/ai-elements/terminal.tsx`.
- All paths must use project-relative or absolute paths cleanly.

---

### Task 1: Create `TerminalLogViewer` Component

**Files:**
- Create: `apps/editor/components/editor/terminal-log-viewer.tsx`

**Interfaces:**
- Consumes: `parseCompileErrors` from `@/lib/compile-errors`, `<Terminal>` & `<TerminalContent>` from `@/components/ai-elements/terminal`.
- Produces: `TerminalLogViewer` React component taking `output: string`, `isStreaming?: boolean`, `compilePath: string`, `onSelectError?: (file: string, line: number) => void`, `onSendToChat?: (text?: string) => void`, `onClear?: () => void`.

- [ ] **Step 1: Write `TerminalLogViewer` component with view mode toggle and error card list**

```tsx
"use client";

import { useMemo, useState } from "react";
import { Terminal, TerminalContent, TerminalHeader, TerminalTitle, TerminalActions, TerminalCopyButton, TerminalClearButton } from "@/components/ai-elements/terminal";
import { parseCompileErrors, type CompileError } from "@/lib/compile-errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Code2, Sparkles, TerminalSquare, LayoutGrid } from "lucide-react";

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
  const errors = useMemo(() => {
    if (!output) return [];
    return parseCompileErrors(output, compilePath);
  }, [output, compilePath]);

  const [viewMode, setViewMode] = useState<"cards" | "raw">("cards");

  return (
    <div className={cn("relative flex flex-col h-full bg-zinc-950 text-zinc-100 border-t border-zinc-800/80", className)}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 px-3 py-1.5 bg-zinc-900/60 text-xs">
        <div className="flex items-center gap-2">
          <TerminalTitle />
          {errors.length > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <AlertCircle className="size-3" />
              {errors.length} {errors.length === 1 ? "Error" : "Errors"}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Segmented Control */}
          <div className="flex items-center p-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/50">
            <button
              onClick={() => setViewMode("cards")}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                viewMode === "cards"
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Cards view for error checking"
            >
              <LayoutGrid className="size-3" />
              Cards
            </button>
            <button
              onClick={() => setViewMode("raw")}
              className={cn(
                "flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                viewMode === "raw"
                  ? "bg-zinc-700 text-zinc-100 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
              title="Raw terminal output"
            >
              <TerminalSquare className="size-3" />
              Raw Log
            </button>
          </div>

          {onSendToChat && output && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSendToChat()}
              className="h-6 px-2 text-[11px] gap-1 border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-300"
            >
              <Sparkles className="size-3 text-amber-400" />
              Send to chat
            </Button>
          )}

          <TerminalActions>
            <TerminalCopyButton />
            {onClear && <TerminalClearButton />}
          </TerminalActions>
        </div>
      </div>

      {/* Content pane */}
      <div className="flex-1 overflow-auto">
        {viewMode === "raw" ? (
          <Terminal output={output} isStreaming={isStreaming} className="h-full rounded-none border-0">
            <TerminalContent className="max-h-full" />
          </Terminal>
        ) : (
          <div className="p-4 space-y-3 font-sans">
            {errors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center text-zinc-400 space-y-2">
                {output ? (
                  <>
                    <CheckCircle2 className="size-8 text-emerald-400" />
                    <p className="text-sm font-medium text-zinc-200">No compilation errors detected</p>
                    <p className="text-xs text-zinc-400 max-w-sm">
                      Build completed cleanly. You can switch to the Raw Log tab to view full tectonic compilation logs.
                    </p>
                  </>
                ) : (
                  <>
                    <TerminalSquare className="size-8 text-zinc-600" />
                    <p className="text-sm font-medium text-zinc-400">Terminal ready</p>
                    <p className="text-xs text-zinc-500">Run compilation to see error cards or log output.</p>
                  </>
                )}
              </div>
            ) : (
              errors.map((err: CompileError, idx: number) => (
                <div
                  key={idx}
                  className="rounded-lg border border-rose-500/20 bg-zinc-900/90 p-3 shadow-md hover:border-rose-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 rounded bg-rose-500/10 px-2 py-0.5 text-xs font-semibold text-rose-400 border border-rose-500/20">
                        <AlertCircle className="size-3.5" />
                        Error
                      </span>
                      <span className="font-mono text-xs text-zinc-300 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">
                        {err.file}:{err.line}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {onSelectError && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSelectError(err.file, err.line)}
                          className="h-7 px-2 text-xs text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 gap-1"
                        >
                          <Code2 className="size-3.5" />
                          Jump to line
                        </Button>
                      )}
                      {onSendToChat && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSendToChat(`Help me fix this LaTeX compile error in ${err.file} on line ${err.line}: ${err.message}`)}
                          className="h-7 px-2 text-xs text-amber-400 hover:text-amber-300 hover:bg-zinc-800/80 gap-1"
                        >
                          <Sparkles className="size-3.5" />
                          Ask Eve
                        </Button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs font-mono text-zinc-200 bg-zinc-950/60 p-2 rounded border border-zinc-800/80 break-words leading-relaxed">
                    {err.message}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit `TerminalLogViewer` component**

```bash
git add apps/editor/components/editor/terminal-log-viewer.tsx
git commit -m "feat(editor): add TerminalLogViewer component with error cards UI"
```

---

### Task 2: Integrate `TerminalLogViewer` into `apps/editor/app/page.tsx`

**Files:**
- Modify: `apps/editor/app/page.tsx`

**Interfaces:**
- Consumes: `TerminalLogViewer` from `@/components/editor/terminal-log-viewer`.
- Produces: Updated `terminalPane` rendering `TerminalLogViewer` with file selection and Eve chat handlers.

- [ ] **Step 1: Replace direct `<Terminal>` rendering in `terminalPane`**

Modify `terminalPane` in `apps/editor/app/page.tsx` around line 2011 to use `TerminalLogViewer`:

```tsx
  const terminalPane = (
    <TerminalLogViewer
      output={terminalOutput}
      isStreaming={isTerminalStreaming}
      compilePath={compilePath}
      onSelectError={(file, line) => {
        const fullPath = file.startsWith("/") ? file : `${projectPath}/${file.replace(/^\.\//, "")}`;
        handleSelectMatch(fullPath, line);
      }}
      onSendToChat={handleSendTerminalToChat}
      onClear={() => setTerminalOutput("")}
    />
  );
```

- [ ] **Step 2: Typecheck the workspace**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: Output clean with 0 errors.

- [ ] **Step 3: Commit integration**

```bash
git add apps/editor/app/page.tsx
git commit -m "feat(editor): integrate TerminalLogViewer into main editor layout"
```

---

### Task 3: Verification & Quality Assurance

- [ ] **Step 1: Verify TypeScript & Build**

Run: `cd apps/editor && bun x tsc --noEmit`
Expected: Clean pass with 0 type errors.

- [ ] **Step 2: Final git status check**

Run: `git status`
Expected: Working tree clean.
