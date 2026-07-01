# Code Search & Replace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a VS Code style Code Search and Replace panel in the editor sidebar connected to a server-side search API.

**Architecture:** Implement a Next.js API route `/api/search` that performs text and RegExp search/replacements on project files, create a responsive `SearchPanel` frontend component, and integrate it into `page.tsx` with editor line-scrolling capability.

**Tech Stack:** React, Next.js (App Router), Lucide React, Tailwind CSS, CodeMirror (v6)

## Global Constraints

- Never edit files inside `apps/editor/my-new-project/` (the LaTeX sandbox) unless explicitly requested.
- Ensure all styling fits with the existing dark/muted modern design system of the editor.
- Always validate type safety using `bun x tsc --noEmit` inside `apps/editor/`.

---

### Task 1: Backend Search & Replace API Route

**Files:**
- Create: `apps/editor/app/api/search/route.ts`

**Interfaces:**
- Consumes: `storage` from `@/lib/storage`, `getProjectPath` and `getProjectIdFromPath` from `@/lib/project`
- Produces: `GET /api/search` and `POST /api/search` API endpoints

- [ ] **Step 1: Write the Search and Replace Route**
Create `apps/editor/app/api/search/route.ts` with the search/replace logic.
```typescript
import { NextRequest } from "next/server";
import { storage } from "@/lib/storage";
import { getProjectPath, getProjectIdFromPath } from "@/lib/project";
import path from "path";

export interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  text: string;
  matchIndex: number;
}

const BINARY_EXTENSIONS = new Set([
  ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".zip", ".gz", ".tar",
  ".woff", ".woff2", ".ttf", ".eot", ".mp4", ".mp3", ".pdf"
]);

function isTextFile(filename: string): boolean {
  const ext = path.extname(filename).toLowerCase();
  return !BINARY_EXTENSIONS.has(ext);
}

export async function GET(req: NextRequest) {
  try {
    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);
    
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query") || "";
    const matchCase = searchParams.get("matchCase") === "true";
    const matchWholeWord = searchParams.get("matchWholeWord") === "true";
    const useRegex = searchParams.get("useRegex") === "true";
    const scope = searchParams.get("scope") || "all"; // "all" | "current"
    const selectedPath = searchParams.get("selectedPath") || "";
    const startLineStr = searchParams.get("startLine") || "";
    const endLineStr = searchParams.get("endLine") || "";

    if (!query) {
      return Response.json({ results: [], resultsByFile: {} });
    }

    const startLine = startLineStr ? parseInt(startLineStr, 10) : null;
    const endLine = endLineStr ? parseInt(endLineStr, 10) : null;

    const files = await storage.listProjectFiles(projectId);
    const results: SearchResult[] = [];

    const traverse = async (nodes: any[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          if (node.children) await traverse(node.children);
        } else {
          // Scope limit
          if (scope === "current" && node.path !== selectedPath) {
            continue;
          }
          if (!isTextFile(node.name)) {
            continue;
          }

          try {
            const content = await storage.readFile(projectId, node.path);
            const lines = content.split("\n");

            lines.forEach((lineText, idx) => {
              const lineNum = idx + 1;
              if (scope === "current") {
                if (startLine !== null && lineNum < startLine) return;
                if (endLine !== null && lineNum > endLine) return;
              }

              if (useRegex) {
                try {
                  const flags = matchCase ? "g" : "gi";
                  const re = new RegExp(query, flags);
                  let match = re.exec(lineText);
                  while (match !== null) {
                    results.push({
                      fileId: node.path,
                      fileName: node.name,
                      line: lineNum,
                      text: lineText,
                      matchIndex: match.index,
                    });
                    match = re.exec(lineText);
                  }
                } catch {
                  // Invalid Regex
                }
              } else {
                const q = matchCase ? query : query.toLowerCase();
                const l = matchCase ? lineText : lineText.toLowerCase();
                let pos = l.indexOf(q);
                while (pos !== -1) {
                  let valid = true;
                  if (matchWholeWord) {
                    const before = pos > 0 ? l[pos - 1] : " ";
                    const after = pos + q.length < l.length ? l[pos + q.length] : " ";
                    const isWordChar = (c: string) => /[a-zA-Z0-9_]/.test(c);
                    if (isWordChar(before) || isWordChar(after)) {
                      valid = false;
                    }
                  }
                  if (valid) {
                    results.push({
                      fileId: node.path,
                      fileName: node.name,
                      line: lineNum,
                      text: lineText,
                      matchIndex: pos,
                    });
                  }
                  pos = l.indexOf(q, pos + 1);
                }
              }
            });
          } catch {
            // Ignored
          }
        }
      }
    };

    await traverse(files);

    const resultsByFile: Record<string, { name: string; matches: SearchResult[] }> = {};
    results.forEach((res) => {
      if (!resultsByFile[res.fileId]) {
        resultsByFile[res.fileId] = { name: res.fileName, matches: [] };
      }
      resultsByFile[res.fileId].matches.push(res);
    });

    return Response.json({ results, resultsByFile });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const projectPath = await getProjectPath();
    const projectId = getProjectIdFromPath(projectPath);

    const body = await req.json();
    const query = body.query || "";
    const replaceText = body.replaceText ?? "";
    const matchCase = body.matchCase === true;
    const matchWholeWord = body.matchWholeWord === true;
    const useRegex = body.useRegex === true;
    const scope = body.scope || "all";
    const selectedPath = body.selectedPath || "";

    if (!query) {
      return Response.json({ error: "Missing query" }, { status: 400 });
    }

    let flags = "g";
    if (!matchCase) flags += "i";

    let pattern: RegExp;
    if (useRegex) {
      pattern = new RegExp(query, flags);
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (matchWholeWord) {
        pattern = new RegExp(`\\b${escaped}\\b`, flags);
      } else {
        pattern = new RegExp(escaped, flags);
      }
    }

    const files = await storage.listProjectFiles(projectId);
    let count = 0;
    const modifiedFiles: string[] = [];

    const traverse = async (nodes: any[]) => {
      for (const node of nodes) {
        if (node.isDir) {
          if (node.children) await traverse(node.children);
        } else {
          if (scope === "current" && node.path !== selectedPath) {
            continue;
          }
          if (!isTextFile(node.name)) {
            continue;
          }

          try {
            const content = await storage.readFile(projectId, node.path);
            const matches = content.match(pattern);
            if (matches && matches.length > 0) {
              const newContent = content.replace(pattern, replaceText);
              await storage.writeFile(projectId, node.path, newContent);
              count += matches.length;
              modifiedFiles.push(node.path);
            }
          } catch {
            // Ignored
          }
        }
      }
    };

    await traverse(files);
    return Response.json({ success: true, count, modifiedFiles });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Run build/compiler type check**
Run `bun x tsc --noEmit` inside `apps/editor/` to ensure the route compiles fine.
Expected output: No compilation errors in route.ts.

- [ ] **Step 3: Commit Task 1**
```bash
git add apps/editor/app/api/search/route.ts
git commit -m "feat: add api/search endpoint for global codebase query and replacement"
```

---

### Task 2: Search Panel Component

**Files:**
- Create: `apps/editor/components/editor/search-panel.tsx`

**Interfaces:**
- Consumes: React hooks, Lucide React icons
- Produces: `SearchPanel` component

- [ ] **Step 1: Implement the Search Panel Component**
Create `apps/editor/components/editor/search-panel.tsx` with full interactive search tools.
```typescript
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Files,
  FileText,
  RefreshCw,
  Regex,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchResult {
  fileId: string;
  fileName: string;
  line: number;
  text: string;
  matchIndex: number;
}

interface SearchPanelProps {
  selectedPath: string | null;
  onSelectMatch: (filePath: string, line: number) => void;
  onReplaceAll: (replaceText: string, searchState: { query: string; options: any }) => void;
}

export interface SearchPanelHandle {
  focusSearch: () => void;
  setSearchValue: (val: string) => void;
}

export const SearchPanel = forwardRef<SearchPanelHandle, SearchPanelProps>(
  ({ selectedPath, onSelectMatch, onReplaceAll }, ref) => {
    const [query, setQuery] = useState("");
    const [replaceText, setReplaceText] = useState("");
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Options
    const [matchCase, setMatchCase] = useState(false);
    const [matchWholeWord, setMatchWholeWord] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [searchScope, setSearchScope] = useState<"all" | "current">("all");

    // Line Range Filter
    const [startLine, setStartLine] = useState<string>("");
    const [endLine, setEndLine] = useState<string>("");

    // Results from server
    const [results, setResults] = useState<SearchResult[]>([]);
    const [resultsByFile, setResultsByFile] = useState<Record<string, { name: string; matches: SearchResult[] }>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

    useImperativeHandle(ref, () => ({
      focusSearch: () => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      },
      setSearchValue: (val: string) => {
        setQuery(val);
      },
    }));

    const fetchResults = async () => {
      if (!query) {
        setResults([]);
        setResultsByFile({});
        return;
      }
      setIsLoading(true);
      try {
        const params = new URLSearchParams({
          query,
          matchCase: String(matchCase),
          matchWholeWord: String(matchWholeWord),
          useRegex: String(useRegex),
          scope: searchScope,
          selectedPath: selectedPath || "",
          startLine: startLine,
          endLine: endLine,
        });
        const res = await fetch(`/api/search?${params.toString()}`);
        const data = await res.json();
        if (data.results) {
          setResults(data.results);
          setResultsByFile(data.resultsByFile || {});
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    // Debounce/Trigger search on option change or typing
    useEffect(() => {
      const timer = setTimeout(() => {
        fetchResults();
      }, 300);
      return () => clearTimeout(timer);
    }, [query, matchCase, matchWholeWord, useRegex, searchScope, selectedPath, startLine, endLine]);

    const toggleFileExpand = (fileId: string) => {
      setExpandedFiles((prev) => ({ ...prev, [fileId]: !prev[fileId] }));
    };

    const handleCollapseAll = () => {
      const collapsed: Record<string, boolean> = {};
      Object.keys(resultsByFile).forEach((id) => {
        collapsed[id] = false;
      });
      setExpandedFiles(collapsed);
    };

    const handleExpandAll = () => {
      setExpandedFiles({});
    };

    return (
      <div className="flex flex-col h-full bg-background select-none">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-[10px] text-muted-foreground tracking-wider uppercase">
              Code Search
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
              title="Clear Search"
              onClick={() => setQuery("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
              title="Refresh"
              onClick={fetchResults}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div className="p-3 space-y-2 border-b border-border bg-background/50">
          <div className="flex items-center gap-1 mb-2">
            <button
              type="button"
              onClick={() => setSearchScope("current")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer border",
                searchScope === "current"
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "text-muted-foreground hover:bg-muted border-transparent"
              )}
            >
              <FileText className="w-3 h-3" />
              Current File
            </button>
            <button
              type="button"
              onClick={() => setSearchScope("all")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-1 px-2 rounded text-[10px] uppercase tracking-wider font-semibold transition-colors cursor-pointer border",
                searchScope === "all"
                  ? "bg-primary/20 text-primary border-primary/30"
                  : "text-muted-foreground hover:bg-muted border-transparent"
              )}
            >
              <Files className="w-3 h-3" />
              All Files
            </button>
          </div>

          <div className="relative group">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded px-2 py-1.5 pr-20 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground text-foreground"
            />
            <div className="absolute right-1 top-1 flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setMatchCase(!matchCase)}
                className={cn(
                  "p-1 rounded text-xs transition-colors cursor-pointer",
                  matchCase
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                title="Match Case"
              >
                <CaseSensitive className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setMatchWholeWord(!matchWholeWord)}
                className={cn(
                  "p-1 rounded text-xs transition-colors cursor-pointer",
                  matchWholeWord
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                title="Match Whole Word"
              >
                <WholeWord className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setUseRegex(!useRegex)}
                className={cn(
                  "p-1 rounded text-xs transition-colors cursor-pointer",
                  useRegex
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:bg-muted"
                )}
                title="Use Regular Expression"
              >
                <Regex className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {searchScope === "current" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex-1 flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded px-2 py-1">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/50 min-w-[32px]">
                  From
                </span>
                <input
                  type="number"
                  placeholder="..."
                  value={startLine}
                  onChange={(e) => setStartLine(e.target.value)}
                  className="w-full bg-transparent border-none text-[10px] focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                />
              </div>
              <div className="flex-1 flex items-center gap-1.5 bg-muted/20 border border-border/40 rounded px-2 py-1">
                <span className="text-[9px] uppercase font-bold text-muted-foreground/50 min-w-[20px]">
                  To
                </span>
                <input
                  type="number"
                  placeholder="..."
                  value={endLine}
                  onChange={(e) => setEndLine(e.target.value)}
                  className="w-full bg-transparent border-none text-[10px] focus:outline-none p-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                />
              </div>
              {(startLine || endLine) && (
                <button
                  type="button"
                  onClick={() => {
                    setStartLine("");
                    setEndLine("");
                  }}
                  className="p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
                  title="Clear Line Range"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          )}

          <div className="relative group">
            <input
              type="text"
              placeholder="Replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              className="w-full bg-muted/30 border border-border rounded px-2 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-muted-foreground text-foreground"
            />
            <button
              type="button"
              onClick={() => onReplaceAll(replaceText, { query, options: { matchCase, matchWholeWord, useRegex, scope: searchScope } })}
              className="absolute right-1 top-1 p-1 hover:bg-muted rounded text-muted-foreground transition-colors cursor-pointer"
              title="Replace All"
              disabled={results.length === 0}
            >
              <ReplaceAll className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1 min-h-[20px]">
            {query && results.length > 0 && (
              <>
                <span>
                  {results.length} results in{" "}
                  {Object.keys(resultsByFile).length}{" "}
                  {Object.keys(resultsByFile).length === 1 ? "file" : "files"}
                </span>
                <div className="flex items-center gap-0.5 opacity-60 hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Collapse All"
                    onClick={handleCollapseAll}
                  >
                    <ChevronsDownUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    className="p-1 hover:bg-muted rounded transition-colors cursor-pointer"
                    title="Expand All"
                    onClick={handleExpandAll}
                  >
                    <ChevronsUpDown className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
          {Object.entries(resultsByFile).map(([fileId, { name, matches }]) => (
            <div key={fileId} className="group/file">
              <button
                type="button"
                onClick={() => toggleFileExpand(fileId)}
                className="flex items-center gap-1 px-2 py-1 hover:bg-muted/50 cursor-pointer transition-colors w-full text-left"
              >
                {expandedFiles[fileId] === false ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
                <span className="text-xs font-medium truncate flex-1 text-foreground">
                  {name}
                </span>
                <span className="text-[10px] bg-muted px-1.5 rounded-full text-muted-foreground group-hover/file:bg-primary/20 group-hover/file:text-primary transition-colors">
                  {matches.length}
                </span>
              </button>

              {expandedFiles[fileId] !== false && (
                <div className="ml-4 space-y-0.5 my-1">
                  {matches.map((match, i) => (
                    <button
                      type="button"
                      key={`${match.fileId}-${match.line}-${i}`}
                      onClick={() => onSelectMatch(match.fileId, match.line)}
                      className="flex items-center px-2 py-0.5 hover:bg-muted cursor-pointer group/item transition-colors w-full text-left"
                    >
                      <span className="text-[10px] text-muted-foreground w-6 tabular-nums">
                        {match.line}
                      </span>
                      <span className="text-xs text-foreground/80 truncate w-full overflow-hidden italic">
                        {match.text.trim()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

          {query && results.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground mb-2 opacity-20" />
              <p className="text-xs text-muted-foreground">
                No results found for "{query}"
              </p>
            </div>
          )}

          {!query && (
            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground/40 mt-10">
              <Search className="w-12 h-12 mb-4" />
              <p className="text-xs uppercase tracking-widest font-semibold italic">
                Search the codebase
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }
);

SearchPanel.displayName = "SearchPanel";
```

- [ ] **Step 2: Check TypeScript compliance**
Run `bun x tsc --noEmit` inside `apps/editor/` to ensure the component is type-safe.
Expected output: No compilation errors.

- [ ] **Step 3: Commit Task 2**
```bash
git add apps/editor/components/editor/search-panel.tsx
git commit -m "feat: implement SearchPanel React component"
```

---

### Task 3: Layout Integration in App Layout

**Files:**
- Modify: `apps/editor/app/page.tsx`

**Interfaces:**
- Consumes: `SearchPanel` from `@/components/editor/search-panel`
- Produces: Integrated visual tab in sidebar with hotkeys and scrolling jump

- [ ] **Step 1: Import Search panel and Search icon**
Import `SearchPanel` and `Search` icon in `apps/editor/app/page.tsx`.
Modify imports around line 53 to include `Search`:
```typescript
import { CheckCircle2Icon, ListTodoIcon, FilePlus, FolderPlus, PanelLeft, PanelRight, Sparkles, Loader2, Check, Home, ChevronRight, ArrowLeft, Clock, Trash2, Plus, Settings, Search } from "lucide-react";
```
And add SearchPanel import around line 58:
```typescript
import { SearchPanel, SearchPanelHandle } from "@/components/editor/search-panel";
```

- [ ] **Step 2: Add Search Tab State and Hotkeys**
Modify states and activeTab:
```typescript
// Modify activeTab type definition in apps/editor/app/page.tsx
const [activeTab, setActiveTab] = useState<"files" | "search" | "chat" | "settings">("files");

// Add refs and pendingLineJump states
const searchPanelRef = useRef<SearchPanelHandle>(null);
const [pendingLineJump, setPendingLineJump] = useState<{ path: string; line: number } | null>(null);
```
Add jump effect:
```typescript
useEffect(() => {
  if (pendingLineJump && selectedPath === pendingLineJump.path && editorViewRef.current) {
    const view = editorViewRef.current;
    const line = pendingLineJump.line;
    const timer = setTimeout(() => {
      try {
        if (view.state.doc.length > 0) {
          const lineObj = view.state.doc.line(Math.min(line, view.state.doc.lines));
          view.dispatch({
            selection: { anchor: lineObj.from, head: lineObj.from },
            scrollIntoView: true,
          });
          setPendingLineJump(null);
        }
      } catch (e) {
        console.error("Error jumping to line:", e);
      }
    }, 100);
    return () => clearTimeout(timer);
  }
}, [pendingLineJump, selectedPath, editedCode]);
```
Add Ctrl+F / Cmd+F handler:
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setActiveTab("search");
      if (!isLeftSidebarOpen) {
        setIsLeftSidebarOpen(true);
      }
      setTimeout(() => {
        searchPanelRef.current?.focusSearch();
      }, 50);
    }
  };
  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [isLeftSidebarOpen]);
```

- [ ] **Step 3: Implement search match select and Replace All handlers**
Add functions:
```typescript
const handleSelectMatch = useCallback((filePath: string, line: number) => {
  setPendingLineJump({ path: filePath, line });
  handleFileSelect(filePath);
}, [handleFileSelect]);

const handleReplaceAll = useCallback(async (replaceText: string, searchState: { query: string; options: any }) => {
  try {
    const res = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: searchState.query,
        replaceText,
        matchCase: searchState.options.matchCase,
        matchWholeWord: searchState.options.matchWholeWord,
        useRegex: searchState.options.useRegex,
        scope: searchState.options.scope,
        selectedPath: selectedPath || "",
      }),
    });
    const data = await res.json();
    if (data.success) {
      // Reload workspace tree
      refreshWorkspace();
      // If selected file was updated, reload its content in the editor
      if (selectedPath && data.modifiedFiles.includes(selectedPath)) {
        // Trigger file select reload
        handleFileSelect(selectedPath);
      }
    }
  } catch (err) {
    console.error(err);
  }
}, [selectedPath, refreshWorkspace, handleFileSelect]);
```

- [ ] **Step 4: Integrate the Search UI elements in layout**
Add the search button tab selector in the Sidebar Tabs header (around line 1571):
```typescript
          <button
            onClick={() => setActiveTab("search")}
            className={cn(
              "flex-1 flex justify-center items-center gap-1.5 py-1.5 px-2 rounded text-[11px] font-semibold cursor-pointer transition-colors",
              activeTab === "search"
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/5 hover:text-foreground"
            )}
          >
            <Search className="size-3.5" />
            <span>Search</span>
          </button>
```
And render `SearchPanel` around line 1621:
```typescript
        <div className={cn("flex-1 flex flex-col overflow-hidden bg-background", activeTab !== "search" && "hidden")}>
          <SearchPanel
            ref={searchPanelRef}
            selectedPath={selectedPath}
            onSelectMatch={handleSelectMatch}
            onReplaceAll={handleReplaceAll}
          />
        </div>
```

- [ ] **Step 5: Typecheck workspace and commit Layout modifications**
Run `bun x tsc --noEmit` inside `apps/editor/` to verify layout updates compile successfully.
Commit modifications:
```bash
git add apps/editor/app/page.tsx
git commit -m "feat: integrate Search tab into layout and support Editor line jumping"
```
